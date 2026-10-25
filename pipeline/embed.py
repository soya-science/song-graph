"""Step 1: embed every song's lyrics with a CLIP text encoder.

CLIP only reads 77 tokens, so each song's lyric lines are packed into chunks of
at most 75 tokens (plus start/end tokens). Each chunk is embedded, the chunk
vectors are L2-normalised and averaged (weighted by token count), and the
average is normalised again to give one vector per song.

Outputs: data/songs.parquet, data/embeddings.npy, data/embeddings.json
"""
import argparse
import json
import re
import time

import numpy as np
import pandas as pd
import torch
from tqdm import tqdm
from transformers import AutoTokenizer, CLIPTextModelWithProjection

from common import CSV_PATH, DATA_DIR, DEFAULT_MODEL, EMB_INFO_PATH, EMB_PATH, SONGS_PATH

CHUNK_TOKENS = 75  # 77 minus start and end tokens
MAX_CHUNKS = 16


def clean_lyrics(text: str) -> str:
    """Normalise whitespace but keep stanza breaks for display."""
    lines = [re.sub(r"\s+", " ", line).strip() for line in str(text).replace("\r", "").split("\n")]
    out = "\n".join(lines).strip()
    return re.sub(r"\n{3,}", "\n\n", out)


def load_songs() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    df["artist"] = df["artist"].astype(str).str.strip()
    df["song"] = df["song"].astype(str).str.strip()
    df["text"] = df["text"].map(clean_lyrics)
    # Sorting by artist makes each artist's songs one contiguous index range.
    df["_a"], df["_s"] = df["artist"].str.lower(), df["song"].str.lower()
    df = df.sort_values(["_a", "artist", "_s"], kind="stable").drop(columns=["_a", "_s"])
    df = df.reset_index(drop=True)
    df.insert(0, "id", np.arange(len(df), dtype=np.int32))
    return df


def pack_chunks(line_ids: list[list[int]]) -> list[list[int]]:
    """Pack whole lines into chunks of at most CHUNK_TOKENS tokens."""
    chunks, cur = [], []
    for ids in line_ids:
        ids = ids[:CHUNK_TOKENS]
        if not ids:
            continue
        if cur and len(cur) + len(ids) > CHUNK_TOKENS:
            chunks.append(cur)
            cur = []
        cur = cur + ids
    if cur:
        chunks.append(cur)
    if len(chunks) > MAX_CHUNKS:  # keep evenly spaced chunks so the whole song is covered
        keep = np.linspace(0, len(chunks) - 1, MAX_CHUNKS).round().astype(int)
        chunks = [chunks[i] for i in keep]
    return chunks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--batch-size", type=int, default=256)
    args = ap.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("WARNING: CUDA not available, embedding on CPU will be slow.")

    t0 = time.time()
    df = load_songs()
    print(f"Loaded {len(df):,} songs from {df['artist'].nunique():,} artists")

    tok = AutoTokenizer.from_pretrained(args.model)
    bos, eos = tok.bos_token_id, tok.eos_token_id
    pad = tok.pad_token_id if tok.pad_token_id is not None else eos

    # Tokenise every non-empty lyric line in one batched call.
    song_lines = [[l for l in t.split("\n") if l.strip()] for t in df["text"]]
    flat = [l for lines in song_lines for l in lines]
    print(f"Tokenising {len(flat):,} lines...")
    flat_ids = tok(flat, add_special_tokens=False)["input_ids"]

    chunk_ids: list[list[int]] = []
    chunk_song: list[int] = []
    pos = 0
    for sid, lines in enumerate(song_lines):
        ids = flat_ids[pos : pos + len(lines)]
        pos += len(lines)
        chunks = pack_chunks(ids) or [[]]
        for c in chunks:
            chunk_ids.append([bos] + c + [eos])
            chunk_song.append(sid)
    chunk_song = np.asarray(chunk_song)
    lens = np.array([len(c) for c in chunk_ids])
    print(f"{len(chunk_ids):,} chunks, mean {lens.mean():.1f} tokens, "
          f"{len(chunk_ids) / len(df):.2f} chunks per song")

    model = CLIPTextModelWithProjection.from_pretrained(
        args.model, dtype=torch.float16 if device == "cuda" else torch.float32
    ).to(device).eval()
    dim = model.config.projection_dim

    # Sort by length so each batch only pads to its own longest chunk.
    order = np.argsort(lens, kind="stable")
    chunk_emb = np.zeros((len(chunk_ids), dim), dtype=np.float32)
    with torch.inference_mode():
        for b in tqdm(range(0, len(order), args.batch_size), desc="Embedding"):
            idx = order[b : b + args.batch_size]
            width = int(lens[idx].max())
            ids = torch.full((len(idx), width), pad, dtype=torch.long)
            mask = torch.zeros((len(idx), width), dtype=torch.long)
            for r, i in enumerate(idx):
                c = chunk_ids[i]
                ids[r, : len(c)] = torch.tensor(c)
                mask[r, : len(c)] = 1
            out = model(input_ids=ids.to(device), attention_mask=mask.to(device)).text_embeds
            out = torch.nn.functional.normalize(out.float(), dim=-1)
            chunk_emb[idx] = out.cpu().numpy()

    # Weighted mean of chunk vectors per song, then re-normalise.
    weights = (lens - 2).clip(min=1).astype(np.float32)
    emb = np.zeros((len(df), dim), dtype=np.float32)
    np.add.at(emb, chunk_song, chunk_emb * weights[:, None])
    emb /= np.linalg.norm(emb, axis=1, keepdims=True).clip(min=1e-8)

    assert np.isfinite(emb).all(), "NaN/inf in embeddings"
    df["n_chunks"] = np.bincount(chunk_song, minlength=len(df)).astype(np.int16)
    df.to_parquet(SONGS_PATH, index=False)
    np.save(EMB_PATH, emb)
    EMB_INFO_PATH.write_text(json.dumps({
        "model": args.model, "dim": int(dim), "count": len(df),
        "chunk_tokens": CHUNK_TOKENS, "max_chunks": MAX_CHUNKS, "chunks": len(chunk_ids),
    }, indent=2))
    print(f"Saved {emb.shape} embeddings to {EMB_PATH} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
