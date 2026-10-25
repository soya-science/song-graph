import type { GraphData } from "../types";

/** Minimum distance between two islands, as a multiple of the sum of their core radii. */
const CLEARANCE = 1.25;
/**
 * Islands are drawn this much larger than UMAP made them (around their own centre),
 * so songs inside an island have room and don't pile up when you zoom in.
 */
export const ISLAND_SCALE = 2;

/**
 * Spread topic islands apart while each island keeps its own size and shape.
 * 1. Scale the distances between island centres by (1 + spacing).
 * 2. Push apart any islands that still overlap (bigger islands move less).
 * Returns the new centre of every island (k x 3).
 */
export function separateIslands(data: GraphData, spacing: number): Float32Array {
  const k = data.meta.topics.length;
  const r = data.topicRadius;
  const mass = data.meta.topics.map((t) => t.count);
  const total = mass.reduce((a, b) => a + b, 0);
  const mid = [0, 1, 2].map((axis) => mass.reduce((s, m, i) => s + m * data.topicCenter[i * 3 + axis], 0) / total);
  const c = Float32Array.from(data.topicCenter, (v, idx) => mid[idx % 3] + (v - mid[idx % 3]) * (1 + spacing));

  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        let dx = c[j * 3] - c[i * 3];
        let dy = c[j * 3 + 1] - c[i * 3 + 1];
        let dz = c[j * 3 + 2] - c[i * 3 + 2];
        let d = Math.hypot(dx, dy, dz);
        const want = (r[i] + r[j]) * ISLAND_SCALE * CLEARANCE;
        if (d >= want) continue;
        if (d < 1e-6) {
          // Same spot: pick a fixed direction so the result is deterministic.
          dx = 1; dy = 0.3 * (i - j); dz = 0;
          d = Math.hypot(dx, dy, dz);
        }
        const push = (want - d) * 0.5;
        const wi = mass[j] / (mass[i] + mass[j]);
        const wj = 1 - wi;
        for (const [axis, delta] of [[0, dx], [1, dy], [2, dz]] as const) {
          const u = delta / d;
          c[i * 3 + axis] -= u * push * wi;
          c[j * 3 + axis] += u * push * wj;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Keep the overall (song-weighted) centre where it was.
  for (let axis = 0; axis < 3; axis++) {
    let now = 0;
    for (let i = 0; i < k; i++) now += c[i * 3 + axis] * mass[i];
    const shift = now / total - mid[axis];
    for (let i = 0; i < k; i++) c[i * 3 + axis] -= shift;
  }
  return c;
}
