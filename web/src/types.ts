export interface ArtistInfo {
  name: string;
  /** First song index; an artist's songs are one contiguous range. */
  start: number;
  count: number;
}

export interface Meta {
  count: number;
  k: number;
  model: string;
  dim: number;
  umap: {
    n_neighbors: number;
    min_dist: number;
    metric: string;
    same_artist_top1: number;
    global_radius: number;
    artist_radius: number;
  };
  artists: ArtistInfo[];
  /** Topic clusters: most distinctive lyric words of each cluster. */
  topics: { count: number; words: string[] }[];
  titles: string[];
}

export interface GraphData {
  meta: Meta;
  count: number;
  k: number;
  /** N x 3, global UMAP of all songs. */
  globalPos: Float32Array;
  /** N x 3, each song inside its own artist's UMAP. */
  artistPos: Float32Array;
  /** N x k nearest neighbours in the full embedding space. */
  knnIdx: Uint32Array;
  knnSim: Float32Array;
  /** Artist index of every song. */
  songArtist: Uint16Array;
  /** Topic cluster of every song. */
  cluster: Uint8Array;
  /** Centre (k x 3) and core radius (k) of each topic island in the global layout. */
  topicCenter: Float32Array;
  topicRadius: Float32Array;
  /** Lower-cased titles for search. */
  titlesLower: string[];
  /** Range of neighbour similarities, used for the threshold slider. */
  simRange: [number, number];
}

export type FilterMode = "highlight" | "isolate";
/** Layouts the user picks. */
export type LayoutMode = "global" | "artist";
/** What is on screen: the picked layout, or the focus graph around one song. */
export type ShownLayout = LayoutMode | "focus";
export type ColorMode = "topic" | "position" | "artist";
export type EdgeMode = "off" | "filtered" | "all";

/** Camera moves, each with a unique id so repeating the same move still triggers. */
export type FocusRequest =
  | { kind: "fit"; id: number }
  | { kind: "song"; song: number; id: number }
  | { kind: "center"; song: number; id: number }
  | { kind: "topic"; topic: number; id: number }
  | { kind: "zoom"; factor: number; id: number };

type Vec3 = [number, number, number];

/** Where each point should be and how it should look. */
export interface Targets {
  positions: Float32Array;
  /** 1 = solid, (0,1) = dimmed, 0 = hidden. */
  alpha: Float32Array;
  size: Float32Array;
  /** Visibility that "Fit view" frames (ignores the selected-song spotlight). */
  frameAlpha: Float32Array;
  layout: ShownLayout;
  /** Label anchors for the per-artist grid. */
  groups: { artist: number; label: Vec3 }[];
  /** Topic islands in the global layout: label anchor, centre and whether it is shown. */
  topicLabels: { topic: number; label: Vec3 }[];
  topicCenters: Float32Array;
  topicShown: Uint8Array;
  /** Song-title labels in the focus graph. */
  nodeLabels: { song: number; depth: number; label: Vec3 }[];
  visibleCount: number;
}
