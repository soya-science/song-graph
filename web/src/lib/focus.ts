import type { GraphData } from "../types";

/** How many of each neighbour's own neighbours to add for a 2-hop view. */
const HOP2_PER_NODE = 4;
/** Preferred distance from the centre for 1-hop and 2-hop songs, and how firmly it holds. */
const RING1 = 30;
const RING2 = 66;
const RING_PULL = 0.3;

export interface EgoGraph {
  center: number;
  /** Songs in the graph: the centre first, then 1-hop, then 2-hop neighbours. */
  nodes: number[];
  /** Hop distance from the centre for each entry in `nodes`. */
  depth: number[];
  /** kNN links among the nodes: flat [a0, b0, a1, b1, ...] song indices. */
  edges: Uint32Array;
  /** Cosine similarity of each link. */
  edgeSim: Float32Array;
  /** 3D offset of each node from the graph centre (nodes.length x 3). */
  offsets: Float32Array;
}

/**
 * The song, its nearest neighbours (and optionally theirs), and every kNN link among
 * them, laid out as a small force-directed graph. More similar songs sit closer.
 */
export function buildEgoGraph(data: GraphData, center: number, hops: 1 | 2): EgoGraph {
  const { k, knnIdx, knnSim } = data;
  const nodes = [center];
  const depth = [0];
  const parent = [-1];
  const index = new Map<number, number>([[center, 0]]);
  const add = (song: number, d: number, p: number) => {
    if (index.has(song)) return;
    index.set(song, nodes.length);
    nodes.push(song);
    depth.push(d);
    parent.push(p);
  };
  for (let r = 0; r < k; r++) add(knnIdx[center * k + r], 1, 0);
  if (hops === 2) {
    const firstHop = nodes.length;
    for (let n = 1; n < firstHop; n++) {
      for (let r = 0; r < HOP2_PER_NODE; r++) add(knnIdx[nodes[n] * k + r], 2, n);
    }
  }

  // Every kNN link whose both ends are in the graph.
  const pairs: number[] = [];
  const sims: number[] = [];
  const seen = new Set<number>();
  for (const a of nodes) {
    for (let r = 0; r < k; r++) {
      const b = knnIdx[a * k + r];
      if (!index.has(b)) continue;
      const key = Math.min(a, b) * data.count + Math.max(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(a, b);
      sims.push(knnSim[a * k + r]);
    }
  }

  const offsets = layout(nodes, depth, parent, pairs, sims, index);
  return {
    center,
    nodes,
    depth,
    edges: Uint32Array.from(pairs),
    edgeSim: Float32Array.from(sims),
    offsets,
  };
}

/** Rest length of a link: very similar songs sit close together. */
function restLength(sim: number) {
  return Math.min(56, Math.max(13, 13 + (1 - sim) * 300));
}

function layout(
  nodes: number[],
  depth: number[],
  parent: number[],
  pairs: number[],
  sims: number[],
  index: Map<number, number>,
): Float32Array {
  const n = nodes.length;
  const p = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  // Start: 1-hop on a sphere around the centre, 2-hop just outside their parent.
  let ring = 0;
  const ringSize = depth.filter((d) => d === 1).length;
  for (let i = 1; i < n; i++) {
    if (depth[i] === 1) {
      const y = 1 - (2 * (ring + 0.5)) / ringSize;
      const r = Math.sqrt(1 - y * y);
      const t = ring * golden;
      const len = 22;
      p[i * 3] = Math.cos(t) * r * len;
      p[i * 3 + 1] = y * len * 0.8;
      p[i * 3 + 2] = Math.sin(t) * r * len;
      ring++;
    } else {
      const q = parent[i];
      const jitter = (i * golden) % (Math.PI * 2);
      for (let a = 0; a < 3; a++) p[i * 3 + a] = p[q * 3 + a] * 1.7;
      p[i * 3] += Math.cos(jitter) * 6;
      p[i * 3 + 2] += Math.sin(jitter) * 6;
    }
  }

  const links = pairs.length / 2;
  const la = new Int32Array(links);
  const lb = new Int32Array(links);
  const rest = new Float32Array(links);
  for (let e = 0; e < links; e++) {
    la[e] = index.get(pairs[e * 2])!;
    lb[e] = index.get(pairs[e * 2 + 1])!;
    rest[e] = restLength(sims[e]);
  }

  const force = new Float32Array(n * 3);
  for (let iter = 0; iter < 220; iter++) {
    const cool = 1 - iter / 240;
    force.fill(0);
    // Repulsion between every pair keeps nodes from piling up.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = p[j * 3] - p[i * 3];
        const dy = p[j * 3 + 1] - p[i * 3 + 1];
        const dz = p[j * 3 + 2] - p[i * 3 + 2];
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 1);
        const f = 520 / d2;
        const d = Math.sqrt(d2);
        force[i * 3] -= (dx / d) * f;
        force[i * 3 + 1] -= (dy / d) * f;
        force[i * 3 + 2] -= (dz / d) * f;
        force[j * 3] += (dx / d) * f;
        force[j * 3 + 1] += (dy / d) * f;
        force[j * 3 + 2] += (dz / d) * f;
      }
    }
    // Springs pull linked songs towards their rest length.
    for (let e = 0; e < links; e++) {
      const i = la[e];
      const j = lb[e];
      const dx = p[j * 3] - p[i * 3];
      const dy = p[j * 3 + 1] - p[i * 3 + 1];
      const dz = p[j * 3 + 2] - p[i * 3 + 2];
      const d = Math.max(Math.hypot(dx, dy, dz), 0.01);
      const f = (d - rest[e]) * 0.08;
      force[i * 3] += (dx / d) * f;
      force[i * 3 + 1] += (dy / d) * f;
      force[i * 3 + 2] += (dz / d) * f;
      force[j * 3] -= (dx / d) * f;
      force[j * 3 + 1] -= (dy / d) * f;
      force[j * 3 + 2] -= (dz / d) * f;
    }
    // Rings: direct neighbours around the centre, their neighbours further out.
    for (let i = 1; i < n; i++) {
      const ringRadius = depth[i] === 1 ? RING1 : RING2;
      const d = Math.max(Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), 0.01);
      const f = (ringRadius - d) * RING_PULL;
      for (let a = 0; a < 3; a++) force[i * 3 + a] += (p[i * 3 + a] / d) * f;
    }
    for (let i = 1; i < n; i++) {
      for (let a = 0; a < 3; a++) {
        const step = Math.max(-3, Math.min(3, force[i * 3 + a])) * cool;
        p[i * 3 + a] += step;
      }
    }
  }
  return p;
}
