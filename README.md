# Song Graph

A 3D map of the 57,650 songs in `spotify_millsongdata.csv`. Each song is placed by how similar its lyrics are to the others. The lyrics are embedded with CLIP's text encoder and reduced to 3D with UMAP. The result is drawn with three.js inside a React app.

Everything is computed once, offline. The site is static files only, with no server.

## How it works

1. **Embed** (`pipeline/embed.py`). CLIP can read only 77 tokens at a time, so each song's lyric lines are packed into chunks of up to 75 tokens. Each chunk is embedded with `openai/clip-vit-large-patch14`. The chunk vectors are averaged, weighted by token count, to give one 768-d vector per song.
2. **Reduce** (`pipeline/reduce.py`). This step computes four things:
   - An exact cosine k-nearest-neighbour graph over all songs (k = 10, on the GPU), using the raw CLIP vectors. This is the similarity shown in the app.
   - 24 topic clusters. KMeans runs on cleaned CLIP vectors, with the shared mean and top 3 principal directions removed. Each cluster is labelled with its most distinctive lyric words, using class-based TF-IDF; profanity and slurs are excluded.
   - One global 3D UMAP of all songs, supervised by the topic clusters (`--cluster-weight`, default 0.8). Without this, the lyrics form one continuous blob. With it, they form separate topic islands.
   - A separate 3D UMAP for each artist's songs. This is the per-artist layout used by the artist filter.
3. **Export** (`pipeline/export.py`). This writes compact binary files and `meta.json` to `web/public/data/`, plus one lyrics file per artist. A lyrics file is loaded only when one of that artist's songs is opened.
4. **Web app** (`web/`). Vite + React + `@react-three/fiber`. It shows all songs as a GPU point cloud with orbit controls and similarity edges. It has an artist filter (dim or hide other songs), an animated switch to the per-artist UMAP layouts, search, and a song panel with lyrics and the 10 most similar songs.

**Live site:** https://soya-science.github.io/song-graph/ (lyrics text is not included in the public site; each song links to its source page).

## Get the dataset

The lyrics dataset is not in this repository because song lyrics are copyrighted. Download the **Spotify Million Song Dataset** from Kaggle. It is a single file, `spotify_millsongdata.csv`, with 57,650 rows and the columns `artist`, `song`, `link` and `text`. Put the file in the repository root. The generated data folders (`data/` and `web/public/data/`) are also kept out of git; the pipeline below recreates them.

## Build the data (once)

Needs Python 3.13 and an NVIDIA GPU. A CPU works too, but is much slower.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\python -m pip install -r pipeline\requirements.txt

cd pipeline
..\.venv\Scripts\python embed.py     # ~20 min on a laptop RTX 4060
..\.venv\Scripts\python reduce.py    # kNN + topics + global UMAP + 643 per-artist UMAPs, ~1.5 min
                                     # options: --clusters 24 --cluster-weight 0.8
..\.venv\Scripts\python export.py    # writes web\public\data\
```

## Run and deploy the site

```powershell
cd web
npm install
npm run dev        # local development
npm run build      # static site in web\dist\
npm run preview    # serve the built site locally
```

To deploy, upload `web/dist/` to any static host: GitHub Pages, Netlify, S3, or nginx. Asset paths are relative, so it also works from a subfolder. The data is about 6 MB for the graph, plus about 72 MB of lyrics that load on demand.

### Publish to GitHub Pages

```powershell
cd web
npm run deploy:pages
```

This builds the site and force-pushes it as a single commit to the `gh-pages` branch of `origin`. It needs the generated data in `web/public/data/`. Lyrics text is stripped from the published copy and only the source links are kept; add `--with-lyrics` to `node scripts/publish-pages.mjs` to include it. In the repository settings, **Pages** must be set to deploy from the `gh-pages` branch, root folder.

## Controls

- **Mouse:**
  - Drag to orbit, right-drag to pan, scroll to zoom toward the cursor.
  - Click a song to open it and centre on it. Double-click to fly in close.
  - Click a topic label to fly to that island.
- **Show connections only** (song panel, or press `G`):
  - Hides every other song and lays out the open song and its 10 nearest neighbours as a labelled graph.
  - "+ their neighbours" (`2`) adds a second ring.
  - Click any node to walk to it. `[` / `]` go back and forward. `Esc` returns to the map.
- **Sidebar:**
  - Search artists, songs or topics (`/`).
  - The topic list flies to an island on click and highlights it on hover.
  - Artist filter chips appear here when you filter.
- **Bottom toolbar:** back/forward, fit view (`F`), zoom (`+`/`−`), auto-rotate (`R`), display settings, and help (`?`).
- With a song open on the map, it and its 10 most similar songs are spotlighted, and the rest of the map dims.
- **Artist filter** (appears in the sidebar after you pick an artist):
  - **On the map / Own maps:** shows their songs on the shared map, or each artist's own UMAP side by side.
  - **Dim others / Hide others:** sets how songs outside the filter are shown.

**Display settings** (sliders icon in the toolbar):
- **Island spacing.** Spreads the topic islands further apart, while each island keeps its size. Overlapping islands are always pushed apart. A few songs that UMAP placed far from their island are drawn in to the island's edge, so they don't scatter as dust between islands.
- **Point size** and **Topic labels**. Labels farther from the camera fade.
- **Colour songs by: Topic / Position / Artist.** Selected artists always get their own distinct colour.
- **Similarity lines on the map: Off / Filtered artists / All songs.** Lines to each song's nearest neighbours in the full embedding space:
  - **Lines across topics** also draws the long lines between islands.
  - The sliders set the number of neighbours and the minimum similarity.

## What the map shows

- The nearest neighbours by lyrics are often covers of the same song by other artists, such as "Blue Christmas" or "Dancing Queen". Parodies show up too: Weird Al's "Bohemian Polka" sits next to "Bohemian Rhapsody".
- Some topic islands are clear-cut: Christmas, religious songs, rap, metal ("blood · death · die"), dance songs, goodbyes, country roads and trains, and Tagalog songs. Others are broader shades of love songs.
- Lyric similarity is mostly not artist-specific: a song's closest match is by the same artist only about 6% of the time.
- CLIP text similarities fall in a narrow band, about 0.83–0.99. The similarity slider adapts to that range.
