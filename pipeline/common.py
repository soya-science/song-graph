"""Shared paths and constants for the offline pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "spotify_millsongdata.csv"

DATA_DIR = ROOT / "data"  # intermediate files, not deployed
SONGS_PATH = DATA_DIR / "songs.parquet"
EMB_PATH = DATA_DIR / "embeddings.npy"
EMB_INFO_PATH = DATA_DIR / "embeddings.json"
KNN_IDX_PATH = DATA_DIR / "knn_idx.npy"
KNN_SIM_PATH = DATA_DIR / "knn_sim.npy"
GLOBAL_UMAP_PATH = DATA_DIR / "global_umap.npy"
ARTIST_UMAP_PATH = DATA_DIR / "artist_umap.npy"
CLUSTERS_PATH = DATA_DIR / "clusters.npy"
TOPICS_PATH = DATA_DIR / "topics.json"
REDUCE_INFO_PATH = DATA_DIR / "reduce.json"

WEB_DATA_DIR = ROOT / "web" / "public" / "data"  # static assets bundled with the site

DEFAULT_MODEL = "openai/clip-vit-large-patch14"
KNN_K = 10

# Layout scale: 95th-percentile distance from the centre after normalisation.
GLOBAL_RADIUS = 100.0
ARTIST_RADIUS = 30.0


def artist_ranges(df) -> list[tuple[int, int]]:
    """[start, end) row range of each artist. Rows are sorted by artist in embed.py."""
    import numpy as np

    a = df.artist.values
    starts = np.flatnonzero(np.r_[True, a[1:] != a[:-1]])
    ends = np.r_[starts[1:], len(a)]
    assert len(starts) == df.artist.nunique(), "songs are not grouped by artist"
    return [(int(s), int(e)) for s, e in zip(starts, ends)]
