import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { LayoutAnimator } from "../lib/animator";

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, uOpacity); }
`;

interface Props {
  animator: LayoutAnimator;
  /** Flat [a0, b0, a1, b1, ...] song index pairs. */
  edges: Uint32Array;
  /** Per-song RGB used to colour each end of an edge. */
  colors: Float32Array;
  /** Fixed colour that overrides `colors`. */
  tint?: [number, number, number];
  opacity: number;
  renderOrder?: number;
}

/** kNN similarity edges whose ends follow the animated point positions. */
export function Edges({ animator, edges, colors, tint, opacity, renderOrder = 3 }: Props) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(edges.length * 3);
    const col = new Float32Array(edges.length * 3);
    for (let v = 0; v < edges.length; v++) {
      const s = edges[v] * 3;
      col[v * 3] = tint ? tint[0] : colors[s];
      col[v * 3 + 1] = tint ? tint[1] : colors[s + 1];
      col[v * 3 + 2] = tint ? tint[2] : colors[s + 2];
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [edges, colors, tint]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uOpacity: { value: opacity } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  const filled = useRef<{ version: number; geometry: THREE.BufferGeometry | null }>({ version: -1, geometry: null });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    material.uniforms.uOpacity.value = opacity;
    animator.tick(state.clock.elapsedTime);
    const f = filled.current;
    if (f.version === animator.version && f.geometry === geometry) return;
    f.version = animator.version;
    f.geometry = geometry;
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const pos = attr.array as Float32Array;
    const cur = animator.current;
    for (let v = 0; v < edges.length; v++) {
      const s = edges[v] * 3;
      pos[v * 3] = cur[s];
      pos[v * 3 + 1] = cur[s + 1];
      pos[v * 3 + 2] = cur[s + 2];
    }
    attr.needsUpdate = true;
  });

  if (edges.length === 0) return null;
  return (
    <lineSegments geometry={geometry} material={material} frustumCulled={false} renderOrder={renderOrder} />
  );
}

/** Fewer, brighter lines for small edge sets; fainter lines for dense ones. */
export function edgeOpacity(edgeCount: number) {
  return Math.min(0.6, Math.max(0.04, 0.6 * Math.sqrt(1500 / Math.max(edgeCount, 1))));
}
