import type { EdgeMode, FilterMode, GraphData, LayoutMode, ShownLayout, Targets } from "../types";
import type { EgoGraph } from "./focus";
import { ISLAND_SCALE, separateIslands } from "./islands";

export const DIM_ALPHA = 0.16;
const GRID_SPACING = 90;
const LABEL_OFFSET = 44;

export interface ViewParams {
  selectedArtists: number[];
  filterMode: FilterMode;
  layout: LayoutMode;
  selectedSong: number | null;
  /** Extra spread between topic islands (0 = as computed, 1 = distances doubled). */
  spacing: number;
  /** Show only this graph (a song and its neighbours), centred where `anchor` sits on the map. */
  focus: { graph: EgoGraph; anchor: number } | null;
  /** Topic being hovered in the topic list: other islands dim. */
  hoverTopic: number | null;
}

/**
 * Work out where every song should sit and how visible it is.
 * - Global layout: all songs at their global UMAP position, with topic islands moved
 *   apart so they don't overlap (see separateIslands); the artist filter either dims
 *   (highlight) or hides (isolate) the other songs.
 * - Per-artist layout: each selected artist's own UMAP cloud gets a grid cell.
 * - Focus: only one song and its neighbours, arranged as a graph; everything else hidden.
 */
export function computeTargets(data: GraphData, v: ViewParams): Targets {
  const n = data.count;
  const k = data.meta.topics.length;
  const positions = Float32Array.from(data.globalPos);
  const alpha = new Float32Array(n);
  const size = new Float32Array(n);
  const hasSel = v.selectedArtists.length > 0;
  let layout: ShownLayout = hasSel ? v.layout : "global";
  const groups: Targets["groups"] = [];
  const nodeLabels: Targets["nodeLabels"] = [];

  // Move each topic island to its separated centre, enlarged around that centre.
  const islands = separateIslands(data, v.spacing);
  const tc = data.topicCenter;
  for (let i = 0; i < n; i++) {
    const c = data.cluster[i] * 3;
    for (let a = 0; a < 3; a++) {
      positions[i * 3 + a] = islands[c + a] + (positions[i * 3 + a] - tc[c + a]) * ISLAND_SCALE;
    }
  }

  if (v.focus) {
    layout = "focus";
    const { graph, anchor } = v.focus;
    const ax = positions[anchor * 3], ay = positions[anchor * 3 + 1], az = positions[anchor * 3 + 2];
    size.fill(1);
    graph.nodes.forEach((s, i) => {
      positions[s * 3] = ax + graph.offsets[i * 3];
      positions[s * 3 + 1] = ay + graph.offsets[i * 3 + 1];
      positions[s * 3 + 2] = az + graph.offsets[i * 3 + 2];
      alpha[s] = 1;
      size[s] = graph.depth[i] === 0 ? 3.4 : graph.depth[i] === 1 ? 2.3 : 1.7;
      if (graph.depth[i] <= 1) {
        nodeLabels.push({ song: s, depth: graph.depth[i], label: [positions[s * 3], positions[s * 3 + 1], positions[s * 3 + 2]] });
      }
    });
  } else if (!hasSel) {
    alpha.fill(1);
    size.fill(1);
  } else if (layout === "global") {
    const hidden = v.filterMode === "isolate" ? 0 : DIM_ALPHA;
    alpha.fill(hidden);
    size.fill(1);
    for (const a of v.selectedArtists) {
      const { start, count } = data.meta.artists[a];
      alpha.fill(1, start, start + count);
      size.fill(2.4, start, start + count);
    }
  } else {
    // Per-artist grid: everything else is hidden.
    const m = v.selectedArtists.length;
    const cols = Math.ceil(Math.sqrt(m));
    const rows = Math.ceil(m / cols);
    v.selectedArtists.forEach((a, slot) => {
      const ox = ((slot % cols) - (cols - 1) / 2) * GRID_SPACING;
      const oy = -(Math.floor(slot / cols) - (rows - 1) / 2) * GRID_SPACING;
      const { start, count } = data.meta.artists[a];
      for (let i = start; i < start + count; i++) {
        positions[i * 3] = data.artistPos[i * 3] + ox;
        positions[i * 3 + 1] = data.artistPos[i * 3 + 1] + oy;
        positions[i * 3 + 2] = data.artistPos[i * 3 + 2];
      }
      alpha.fill(1, start, start + count);
      size.fill(1.6, start, start + count);
      groups.push({ artist: a, label: [ox, oy + LABEL_OFFSET, 0] });
    });
  }

  // "Fit view" frames what the filter shows, ignoring the selected-song spotlight below.
  const frameAlpha = Float32Array.from(alpha);

  // The selected song and its nearest neighbours stay visible in the global layout.
  // Without an artist filter, everything else is dimmed so the neighbourhood isn't buried.
  if (v.selectedSong !== null && layout === "global") {
    const s = v.selectedSong;
    if (!hasSel) {
      alpha.fill(DIM_ALPHA);
      size.fill(1);
    }
    alpha[s] = 1;
    size[s] = Math.max(size[s], 2.6);
    for (let r = 0; r < data.k; r++) {
      const j = data.knnIdx[s * data.k + r];
      alpha[j] = 1;
      size[j] = Math.max(size[j], 2);
    }
  }

  // Hovering a topic in the list dims the other islands.
  if (v.hoverTopic !== null && layout === "global") {
    for (let i = 0; i < n; i++) {
      if (alpha[i] >= 1 && data.cluster[i] !== v.hoverTopic) alpha[i] = DIM_ALPHA;
    }
  }

  // Topic labels sit just above each island that the filter still shows.
  const topicLabels: Targets["topicLabels"] = [];
  const topicShown = new Uint8Array(k);
  if (layout === "global") {
    for (let i = 0; i < n; i++) if (frameAlpha[i] > 0) topicShown[data.cluster[i]] = 1;
    for (let c = 0; c < k; c++) {
      if (!topicShown[c]) continue;
      topicLabels.push({
        topic: c,
        label: [islands[c * 3], islands[c * 3 + 1] + data.topicRadius[c] * ISLAND_SCALE + 3, islands[c * 3 + 2]],
      });
    }
  }

  let visibleCount = 0;
  for (let i = 0; i < n; i++) if (alpha[i] >= 1) visibleCount++;
  return {
    positions,
    alpha,
    size,
    frameAlpha,
    layout,
    groups,
    topicLabels,
    topicCenters: islands,
    topicShown,
    nodeLabels,
    visibleCount,
  };
}

/**
 * Similarity edges as a flat [a0, b0, a1, b1, ...] index list.
 * "filtered" draws edges only while an artist filter is active; "all" also draws them
 * for the whole unfiltered map (dense, 100k+ lines). The focus graph draws its own links.
 */
export function computeEdges(
  data: GraphData,
  targets: Targets,
  opts: {
    mode: EdgeMode;
    hasSelection: boolean;
    k: number;
    minSim: number;
    withinFilter: boolean;
    /** Also draw edges between different topic islands (long lines across the gaps). */
    crossTopics: boolean;
  },
): Uint32Array {
  if (targets.layout === "focus") return new Uint32Array(0);
  if (opts.mode === "off" || (opts.mode === "filtered" && !opts.hasSelection)) return new Uint32Array(0);
  const { k, knnIdx, knnSim, count } = data;
  const solid = targets.alpha;
  const seen = new Set<number>();
  const out: number[] = [];
  const kk = Math.min(opts.k, k);
  for (let i = 0; i < count; i++) {
    if (solid[i] < 1) continue;
    for (let r = 0; r < kk; r++) {
      const o = i * k + r;
      if (knnSim[o] < opts.minSim) break; // neighbours are sorted by similarity
      const j = knnIdx[o];
      // Edges to dimmed songs are allowed in the global layout (they show links to other
      // artists). Hidden songs and per-artist grid positions need both ends solid.
      if (solid[j] < 1 && (targets.layout === "artist" || opts.withinFilter || solid[j] === 0)) continue;
      // Each artist's own UMAP has its own coordinates, so cross-artist lines would be meaningless.
      if (targets.layout === "artist" && data.songArtist[i] !== data.songArtist[j]) continue;
      if (targets.layout === "global" && !opts.crossTopics && data.cluster[i] !== data.cluster[j]) continue;
      const key = i < j ? i * count + j : j * count + i;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(i, j);
    }
  }
  return Uint32Array.from(out);
}

/**
 * Centre and radius that frame the filtered points. Large sets use the 95th-percentile
 * radius so a few outliers don't shrink the view; small sets include every point.
 */
export function frameTargets(t: Targets): { center: [number, number, number]; radius: number } {
  const p = t.positions;
  const a = t.frameAlpha;
  let cx = 0, cy = 0, cz = 0, m = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] < 1) continue;
    cx += p[i * 3]; cy += p[i * 3 + 1]; cz += p[i * 3 + 2]; m++;
  }
  if (m === 0) return { center: [0, 0, 0], radius: 100 };
  cx /= m; cy /= m; cz /= m;
  const d: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] < 1) continue;
    d.push(Math.hypot(p[i * 3] - cx, p[i * 3 + 1] - cy, p[i * 3 + 2] - cz));
  }
  d.sort((x, y) => x - y);
  const q = d.length < 1000 ? 1 : 0.95;
  const radius = Math.max(d[Math.min(d.length - 1, Math.floor(d.length * q))] ?? 10, 10);
  return { center: [cx, cy, cz], radius };
}
