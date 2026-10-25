import type { ColorMode, GraphData } from "../types";

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** Distinct categorical colours for the first selected artists, so they never look alike. */
const SELECTION_HEX = [
  "#4fc3f7", "#ff8a65", "#c5e86c", "#f06292", "#ffd54f",
  "#b39ddb", "#4dd0b4", "#ef5350", "#90caf9", "#ce93d8",
];
const SELECTION_RGB = SELECTION_HEX.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));

/** Base hue per artist, spaced by the golden angle. */
function baseArtistColor(artist: number): [number, number, number] {
  const h = ((artist * 137.508) % 360) / 360;
  const l = 0.56 + (0.1 * ((artist * 7) % 3)) / 2;
  return hslToRgb(h, 0.72, l);
}

/** RGB per artist (n x 3). Selected artists get the categorical palette in selection order. */
export function buildArtistPalette(nArtists: number, selected: number[]): Float32Array {
  const out = new Float32Array(nArtists * 3);
  for (let a = 0; a < nArtists; a++) out.set(baseArtistColor(a), a * 3);
  selected.forEach((a, slot) => {
    if (slot < SELECTION_RGB.length) out.set(SELECTION_RGB[slot], a * 3);
  });
  return out;
}

export function paletteCss(palette: Float32Array, artist: number): string {
  const c = (i: number) => Math.round(palette[artist * 3 + i] * 255);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** Colour of each topic cluster: hues spread by the golden ratio, two lightness levels. */
export function topicColor(topic: number): [number, number, number] {
  const h = (topic * 0.618034 + 0.08) % 1;
  return hslToRgb(h, 0.68, topic % 2 ? 0.7 : 0.6);
}

export function topicCss(topic: number): string {
  const [r, g, b] = topicColor(topic).map((v) => Math.round(v * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Per-point RGB. Selected artists always use their palette colour, so they stand out
 * in every mode. Position colours come from the global layout so a song keeps its colour.
 */
export function buildColors(
  data: GraphData,
  mode: ColorMode,
  palette: Float32Array,
  selected: number[],
): Float32Array {
  const out =
    mode === "artist" ? artistColors(data, palette) : mode === "topic" ? topicColors(data) : positionColors(data);
  if (mode !== "artist") {
    for (const a of selected.slice(0, SELECTION_RGB.length)) {
      const { start, count } = data.meta.artists[a];
      for (let i = start; i < start + count; i++) out.set(palette.subarray(a * 3, a * 3 + 3), i * 3);
    }
  }
  return out;
}

function artistColors(data: GraphData, palette: Float32Array): Float32Array {
  const n = data.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = data.songArtist[i] * 3;
    out[i * 3] = palette[a];
    out[i * 3 + 1] = palette[a + 1];
    out[i * 3 + 2] = palette[a + 2];
  }
  return out;
}

function topicColors(data: GraphData): Float32Array {
  const table = data.meta.topics.map((_, c) => topicColor(c));
  const out = new Float32Array(data.count * 3);
  for (let i = 0; i < data.count; i++) out.set(table[data.cluster[i]], i * 3);
  return out;
}

const positionCache = new WeakMap<GraphData, Float32Array>();

function positionColors(data: GraphData): Float32Array {
  let base = positionCache.get(data);
  if (!base) {
    base = computePositionColors(data);
    positionCache.set(data, base);
  }
  return Float32Array.from(base);
}

/** Map each axis' 2nd..98th percentile to the colour range, so outliers don't squash it. */
function computePositionColors(data: GraphData): Float32Array {
  const n = data.count;
  const out = new Float32Array(n * 3);
  const p = data.globalPos;
  const lo: number[] = [];
  const hi: number[] = [];
  for (let d = 0; d < 3; d++) {
    const axis = new Float32Array(n);
    for (let i = 0; i < n; i++) axis[i] = p[i * 3 + d];
    axis.sort();
    lo.push(axis[Math.floor(n * 0.02)]);
    hi.push(axis[Math.floor(n * 0.98)]);
  }
  for (let i = 0; i < n * 3; i++) {
    const d = i % 3;
    const t = Math.min(1, Math.max(0, (p[i] - lo[d]) / (hi[d] - lo[d] || 1)));
    out[i] = 0.18 + 0.82 * t;
  }
  return out;
}
