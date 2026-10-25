"""Step 2: build the similarity graph, topic clusters and the 3D UMAP layouts.

- Exact cosine kNN graph over all songs on the raw CLIP vectors (GPU, in blocks).
  This is the similarity shown in the app (neighbour lists and edges).
- Topic clusters: KMeans on cleaned CLIP vectors, with keywords per cluster.
- One global 3D UMAP of every song, supervised by the topic clusters so that
  clusters form separate islands instead of one continuous blob.
- One 3D UMAP per artist, run on only that artist's songs.

Outputs: data/knn_idx.npy, data/knn_sim.npy, data/clusters.npy, data/topics.json,
         data/global_umap.npy, data/artist_umap.npy, data/reduce.json
"""
import argparse
import json
import time
import warnings

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from tqdm import tqdm

from common import (ARTIST_RADIUS, ARTIST_UMAP_PATH, CLUSTERS_PATH, EMB_PATH, GLOBAL_RADIUS,
                    GLOBAL_UMAP_PATH, KNN_IDX_PATH, KNN_K, KNN_SIM_PATH, REDUCE_INFO_PATH, SONGS_PATH,
                    TOPICS_PATH, artist_ranges)
from topics import cluster_songs, layout_vectors, topic_keywords

N_NEIGHBORS = 15
MIN_DIST = 0.1
SEED = 42
N_CLUSTERS = 24
# How strongly the topic clusters pull apart in the global layout (0 = ignore them, 1 = only them).
CLUSTER_WEIGHT = 0.8


def exact_knn(emb: np.ndarray, k: int, block: int = 2048):
    """Top-k cosine neighbours for unit vectors. Column 0 is always the song itself."""
    import torch  # imported here so the per-artist UMAP worker processes stay light

    device = "cuda" if torch.cuda.is_available() else "cpu"
    x = torch.from_numpy(emb).to(device)
    n = len(emb)
    idx = np.zeros((n, k), dtype=np.int64)
    sim = np.zeros((n, k), dtype=np.float32)
    for s in tqdm(range(0, n, block), desc="kNN"):
        e = min(s + block, n)
        sims = x[s:e] @ x.T
        rows = torch.arange(e - s, device=device)
        sims[rows, rows + s] = 2.0  # force self to rank first, even next to exact duplicates
        v, i = torch.topk(sims, k, dim=1)
        v[:, 0] = 1.0
        idx[s:e] = i.cpu().numpy()
        sim[s:e] = v.clamp(-1, 1).cpu().numpy()
    return idx, sim


def normalise(pos: np.ndarray, radius: float) -> np.ndarray:
    pos = pos - pos.mean(axis=0, keepdims=True)
    r = np.percentile(np.linalg.norm(pos, axis=1), 95) if len(pos) > 1 else 0.0
    if r > 1e-9:
        pos = pos * (radius / r)
    return pos.astype(np.float32)


def artist_layout(x: np.ndarray) -> np.ndarray:
    """3D layout of one artist's songs."""
    n = len(x)
    if n < 5:
        out = np.zeros((n, 3), dtype=np.float32)
        if n >= 2:
            from sklearn.decomposition import PCA
            comps = min(3, n - 1)
            out[:, :comps] = PCA(n_components=comps).fit_transform(x)
        return normalise(out, ARTIST_RADIUS)

    import umap
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        reducer = umap.UMAP(
            n_components=3, metric="cosine", n_neighbors=min(N_NEIGHBORS, n - 1),
            min_dist=MIN_DIST, init="spectral" if n > 30 else "random", random_state=SEED,
        )
        pos = reducer.fit_transform(x)
    return normalise(pos, ARTIST_RADIUS)


def print_neighbours(df, idx, sim, queries):
    for artist, title in queries:
        m = df[(df.artist.str.lower() == artist.lower()) & (df.song.str.lower() == title.lower())]
        if m.empty:
            continue
        i = int(m.id.iloc[0])
        print(f"\n{df.song[i]} - {df.artist[i]}")
        for j, s in zip(idx[i, 1:6], sim[i, 1:6]):
            print(f"   {s:.3f}  {df.song[j]} - {df.artist[j]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8, help="parallel workers for per-artist UMAP")
    ap.add_argument("--clusters", type=int, default=N_CLUSTERS, help="number of topic clusters")
    ap.add_argument("--cluster-weight", type=float, default=CLUSTER_WEIGHT,
                    help="0..1, how strongly topic clusters separate in the global layout")
    ap.add_argument("--skip-global", action="store_true")
    args = ap.parse_args()

    t0 = time.time()
    df = pd.read_parquet(SONGS_PATH)
    emb = np.load(EMB_PATH)
    n = len(emb)
    print(f"{n:,} songs, {emb.shape[1]}-d embeddings")

    # 1. Similarity graph on the raw CLIP vectors (self + KNN_K neighbours)
    idx, sim = exact_knn(emb, KNN_K + 1)
    np.save(KNN_IDX_PATH, idx[:, 1:].astype(np.uint32))
    np.save(KNN_SIM_PATH, sim[:, 1:].astype(np.float32))
    same = (df.artist.values[idx[:, 1]] == df.artist.values).mean()
    print(f"Top-1 neighbour is by the same artist for {same:.1%} of songs")
    print_neighbours(df, idx, sim, [
        ("ABBA", "Dancing Queen"), ("Bob Dylan", "Like A Rolling Stone"),
        ("Queen", "Bohemian Rhapsody"), ("John Lennon", "Imagine"),
        ("Eminem", "Lose Yourself"), ("Elvis Presley", "Blue Christmas"),
    ])

    # 2. Topic clusters on cleaned vectors, with keywords
    lay = layout_vectors(emb)
    print(f"\nClustering into {args.clusters} topics...")
    t = time.time()
    labels = cluster_songs(lay, args.clusters)
    keywords = topic_keywords(df.text, labels)
    sizes = np.bincount(labels, minlength=args.clusters)
    np.save(CLUSTERS_PATH, labels)
    TOPICS_PATH.write_text(json.dumps(
        [{"id": c, "count": int(sizes[c]), "words": keywords[c]} for c in range(args.clusters)], indent=2))
    print(f"Clustered in {time.time() - t:.0f}s")
    for c in np.argsort(-sizes):
        print(f"  {c:2d} ({sizes[c]:5d}): {', '.join(keywords[c])}")

    # 3. Global UMAP on the cleaned vectors, supervised by the topic clusters
    if args.skip_global and GLOBAL_UMAP_PATH.exists():
        print("Skipping global UMAP (already exists)")
    else:
        import umap
        print(f"\nRunning global UMAP (cluster weight {args.cluster_weight})...")
        t = time.time()
        lidx, lsim = exact_knn(lay, N_NEIGHBORS)
        knn = (lidx.astype(np.int32), (1.0 - lsim).clip(min=0).astype(np.float32), None)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            reducer = umap.UMAP(n_components=3, metric="cosine", n_neighbors=N_NEIGHBORS,
                                min_dist=MIN_DIST, random_state=SEED, precomputed_knn=knn,
                                target_weight=args.cluster_weight, verbose=True)
            g = reducer.fit_transform(lay, y=labels if args.cluster_weight > 0 else None)
        np.save(GLOBAL_UMAP_PATH, normalise(g, GLOBAL_RADIUS))
        print(f"Global UMAP done in {time.time() - t:.0f}s")

    # 4. Per-artist UMAPs (songs of an artist are one contiguous range)
    ranges = artist_ranges(df)
    print(f"\nRunning per-artist UMAP for {len(ranges)} artists with {args.jobs} workers...")
    t = time.time()
    results = Parallel(n_jobs=args.jobs, verbose=5)(
        delayed(artist_layout)(lay[s:e]) for s, e in ranges
    )
    a_pos = np.zeros((n, 3), dtype=np.float32)
    for (s, e), pos in zip(ranges, results):
        a_pos[s:e] = pos
    np.save(ARTIST_UMAP_PATH, a_pos)
    print(f"Per-artist UMAP done in {time.time() - t:.0f}s")

    g = np.load(GLOBAL_UMAP_PATH)
    assert g.shape == (n, 3) and a_pos.shape == (n, 3)
    assert np.isfinite(g).all() and np.isfinite(a_pos).all(), "NaN in layouts"
    REDUCE_INFO_PATH.write_text(json.dumps({
        "n_neighbors": N_NEIGHBORS, "min_dist": MIN_DIST, "metric": "cosine", "seed": SEED,
        "knn_k": KNN_K, "global_radius": GLOBAL_RADIUS, "artist_radius": ARTIST_RADIUS,
        "same_artist_top1": float(same), "clusters": args.clusters, "cluster_weight": args.cluster_weight,
    }, indent=2))
    print(f"\nAll done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
