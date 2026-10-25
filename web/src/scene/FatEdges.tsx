import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { LayoutAnimator } from "../lib/animator";

interface Props {
  animator: LayoutAnimator;
  /** Flat [a0, b0, a1, b1, ...] song index pairs. */
  edges: Uint32Array;
  /** RGB per line end (edges.length x 3), in display (sRGB) values. */
  colors: Float32Array;
  /** Line width in CSS pixels. */
  width: number;
  opacity: number;
  renderOrder?: number;
}

/** Thick, anti-aliased lines whose ends follow the animated point positions. */
export function FatEdges({ animator, edges, colors, width, opacity, renderOrder = 5 }: Props) {
  const size = useThree((s) => s.size);
  const material = useMemo(
    () => new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, depthWrite: false }),
    [],
  );
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(new Float32Array(Math.max(edges.length, 2) * 3));
    // LineMaterial converts to sRGB on output, so hand it linear colours.
    geometry.setColors(colors.length ? colors.map((c) => Math.pow(c, 2.2)) : new Float32Array(6));
    const l = new LineSegments2(geometry, material);
    l.frustumCulled = false;
    return l;
  }, [edges, colors, material]);
  const filled = useRef<{ version: number; line: LineSegments2 | null }>({ version: -1, line: null });

  useEffect(() => () => line.geometry.dispose(), [line]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [material, size]);

  useFrame((state) => {
    material.linewidth = width;
    material.opacity = opacity;
    line.renderOrder = renderOrder;
    animator.tick(state.clock.elapsedTime);
    const f = filled.current;
    if (f.version === animator.version && f.line === line) return;
    f.version = animator.version;
    f.line = line;
    const attr = line.geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const buf = attr.data.array as Float32Array;
    const cur = animator.current;
    for (let v = 0; v < edges.length; v++) {
      const s = edges[v] * 3;
      buf[v * 3] = cur[s];
      buf[v * 3 + 1] = cur[s + 1];
      buf[v * 3 + 2] = cur[s + 2];
    }
    attr.data.needsUpdate = true;
  });

  if (edges.length === 0) return null;
  return <primitive object={line} />;
}
