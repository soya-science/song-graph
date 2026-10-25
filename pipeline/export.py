"""Step 3: write the static assets the web app loads (web/public/data/).

meta.json        artists, titles, model + UMAP settings
global_pos.f32   N x 3 float32, global UMAP layout
artist_pos.f32   N x 3 float32, each song in its own artist's UMAP layout
knn_idx.u32      N x K uint32, nearest neighbours (cosine, full embedding space)
knn_sim.f32      N x K float32, cosine similarity of those neighbours
cluster.u8       N uint8, topic cluster of each song (keywords in meta.json "topics")
lyrics/{a}.json  [[lyrics, link], ...] for artist a, in song order (lazy-loaded)
"""
import json
import shutil

import numpy as np
import pandas as pd

from common import (ARTIST_UMAP_PATH, CLUSTERS_PATH, EMB_INFO_PATH, GLOBAL_UMAP_PATH, KNN_IDX_PATH,
                    KNN_SIM_PATH, REDUCE_INFO_PATH, SONGS_PATH, TOPICS_PATH, WEB_DATA_DIR, artist_ranges)

SOURCE_SITE = "https://www.lyricsfreak.com"


def write_bin(name: str, arr: np.ndarray, dtype: str):
    path = WEB_DATA_DIR / name
    np.ascontiguousarray(arr, dtype=dtype).tofile(path)
    print(f"  {name:16s} {arr.shape}  {path.stat().st_size / 1e6:.2f} MB")


def main():
    df = pd.read_parquet(SONGS_PATH)
    n = len(df)
    g = np.load(GLOBAL_UMAP_PATH)
    a = np.load(ARTIST_UMAP_PATH)
    ki = np.load(KNN_IDX_PATH)
    ks = np.load(KNN_SIM_PATH)
    cl = np.load(CLUSTERS_PATH)
    topics = json.loads(TOPICS_PATH.read_text())
    assert g.shape == a.shape == (n, 3) and ki.shape == ks.shape and len(ki) == n and cl.shape == (n,)
    assert cl.max() < 256 and len(topics) == cl.max() + 1

    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Writing to {WEB_DATA_DIR}")
    write_bin("global_pos.f32", g, "<f4")
    write_bin("artist_pos.f32", a, "<f4")
    write_bin("knn_idx.u32", ki, "<u4")
    write_bin("knn_sim.f32", ks, "<f4")
    write_bin("cluster.u8", cl, "u1")

    ranges = artist_ranges(df)
    emb_info = json.loads(EMB_INFO_PATH.read_text())
    red_info = json.loads(REDUCE_INFO_PATH.read_text())
    meta = {
        "count": n,
        "k": int(ki.shape[1]),
        "model": emb_info["model"],
        "dim": emb_info["dim"],
        "umap": red_info,
        "artists": [{"name": df.artist[s], "start": s, "count": e - s} for s, e in ranges],
        "topics": [{"count": t["count"], "words": t["words"]} for t in topics],
        "titles": df.song.tolist(),
    }
    (WEB_DATA_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")),
                                            encoding="utf-8")
    print(f"  meta.json        {(WEB_DATA_DIR / 'meta.json').stat().st_size / 1e6:.2f} MB")

    lyr_dir = WEB_DATA_DIR / "lyrics"
    shutil.rmtree(lyr_dir, ignore_errors=True)
    lyr_dir.mkdir()
    total = 0
    for ai, (s, e) in enumerate(ranges):
        rows = [[df.text[i], SOURCE_SITE + df.link[i]] for i in range(s, e)]
        p = lyr_dir / f"{ai}.json"
        p.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        total += p.stat().st_size
    print(f"  lyrics/          {len(ranges)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
