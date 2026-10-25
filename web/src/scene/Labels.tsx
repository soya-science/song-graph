import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { LayoutAnimator } from "../lib/animator";
import { topicCss } from "../lib/colors";
import type { GraphData, Targets } from "../types";

/** A DOM element that follows a 3D point. `pos` returns null to hide it. */
export interface LabelAnchor {
  el: HTMLElement;
  pos: () => readonly [number, number, number] | null;
  /** Fade with distance and stack nearer labels on top. */
  depthFade?: boolean;
}
export type LabelRegistry = Map<string, LabelAnchor>;

function register(registry: LabelRegistry, key: string, pos: LabelAnchor["pos"], depthFade = false) {
  return (el: HTMLElement | null) => {
    if (el) registry.set(key, { el, pos, depthFade });
    else registry.delete(key);
  };
}

const HIDDEN = "translate(-9999px, -9999px)";

/** Inside the Canvas: moves every registered label to its point's screen position each frame. */
export function LabelProjector({ registry }: { registry: LabelRegistry }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size, controls }) => {
    camera.updateMatrixWorld();
    const orbit = (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? target;
    const focus = camera.position.distanceTo(orbit);
    for (const { el, pos, depthFade } of registry.values()) {
      const p = pos();
      if (!p) {
        el.style.transform = HIDDEN;
        continue;
      }
      v.set(p[0], p[1], p[2]);
      const dist = camera.position.distanceTo(v);
      v.project(camera);
      if (v.z > 1) {
        el.style.transform = HIDDEN; // behind the camera
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (depthFade) {
        // Full opacity in front of the orbit centre, fading to 25% far behind it.
        const t = Math.min(1, Math.max(0, (dist - focus * 0.9) / (focus * 0.8)));
        el.style.opacity = (1 - 0.75 * t).toFixed(2);
        el.style.zIndex = String(Math.max(0, 10000 - Math.round(dist)));
      }
    }
  });
  return null;
}

interface OverlayProps {
  data: GraphData;
  targets: Targets;
  animator: LayoutAnimator;
  hovered: number | null;
  selected: number | null;
  registry: LabelRegistry;
  colorOf: (artist: number) => string;
  showTopics: boolean;
  hoverTopic: number | null;
  onTopicClick: (topic: number) => void;
  onTopicHover: (topic: number | null) => void;
  onSongClick: (song: number) => void;
}

/** Outside the Canvas: tooltip, topic labels, focus-graph song labels, per-artist labels. */
export function LabelOverlay({
  data,
  targets,
  animator,
  hovered,
  selected,
  registry,
  colorOf,
  showTopics,
  hoverTopic,
  onTopicClick,
  onTopicHover,
  onSongClick,
}: OverlayProps) {
  const songPos = (s: number) => () => {
    const c = animator.current;
    return [c[s * 3], c[s * 3 + 1], c[s * 3 + 2]] as const;
  };
  const labelled = new Set(targets.nodeLabels.map((n) => n.song));
  return (
    <div className="label-layer">
      {showTopics &&
        targets.topicLabels.map((t) => (
          <div
            key={`t${t.topic}`}
            className="anchor"
            style={{ transform: HIDDEN }}
            ref={register(registry, `topic${t.topic}`, () => t.label, true)}
          >
            <button
              className={`topic-label ${hoverTopic === t.topic ? "active" : ""}`}
              onClick={() => onTopicClick(t.topic)}
              onMouseEnter={() => onTopicHover(t.topic)}
              onMouseLeave={() => onTopicHover(null)}
              title="Fly to this topic"
            >
              <span className="dot" style={{ background: topicCss(t.topic) }} />
              {data.meta.topics[t.topic].words.slice(0, 3).join(" · ")}
            </button>
          </div>
        ))}
      {targets.nodeLabels.map((nl) => (
        <div
          key={`n${nl.song}`}
          className="anchor"
          style={{ transform: HIDDEN }}
          ref={register(registry, `node${nl.song}`, songPos(nl.song), true)}
        >
          <button
            className={`node-label depth-${nl.depth} ${hovered === nl.song ? "hovered" : ""}`}
            onClick={() => onSongClick(nl.song)}
          >
            <span className="node-title">{data.meta.titles[nl.song]}</span>
            <span className="node-artist">{data.meta.artists[data.songArtist[nl.song]].name}</span>
          </button>
        </div>
      ))}
      {hovered !== null && hovered !== selected && !labelled.has(hovered) && (
        <div key={`h${hovered}`} className="anchor" style={{ transform: HIDDEN }} ref={register(registry, "hover", songPos(hovered))}>
          <div className="tooltip">
            <div className="tooltip-title">{data.meta.titles[hovered]}</div>
            <div className="tooltip-artist">
              <span className="dot" style={{ background: colorOf(data.songArtist[hovered]) }} />
              {data.meta.artists[data.songArtist[hovered]].name}
            </div>
          </div>
        </div>
      )}
      {targets.layout === "artist" &&
        targets.groups.map((g) => (
          <div
            key={`a${g.artist}`}
            className="anchor"
            style={{ transform: HIDDEN }}
            ref={register(registry, `artist${g.artist}`, () => g.label)}
          >
            <div className="artist-label">
              <span className="dot" style={{ background: colorOf(g.artist) }} />
              {data.meta.artists[g.artist].name}
              <span className="artist-label-count">{data.meta.artists[g.artist].count}</span>
            </div>
          </div>
        ))}
    </div>
  );
}
