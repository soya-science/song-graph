import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { LayoutAnimator } from "../lib/animator";
import type { Targets } from "../types";

/** Projected size: a world-space length of 1 at distance d covers pointScale / d pixels. */
export function pointScale(heightPx: number, fovDeg: number) {
  return heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
}

/** Largest on-screen point diameter in CSS pixels, so zooming in doesn't fill the view with balls. */
export const MAX_POINT_PX = 18;
const SIZE_GAIN = 1.85;

/**
 * On-screen point diameter in CSS pixels. Points grow with the square root of zoom
 * rather than linearly, so close-ups stay airy while the overview stays visible.
 * Must match the vertex shader below (used for hover picking).
 */
export function pointDiameter(size: number, pointSize: number, scaleCss: number, distance: number) {
  const d = size * pointSize * SIZE_GAIN * Math.sqrt(scaleCss / distance);
  return Math.max(1.5, Math.min(d, MAX_POINT_PX * Math.sqrt(pointSize) * (0.6 + 0.4 * size)));
}

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uSize;
  uniform float uScale;   // pointScale in device pixels
  uniform float uPxScale; // SIZE_GAIN * sqrt(devicePixelRatio)
  uniform float uPass;   // 0: solid points, 1: dimmed points
  uniform float uMaxSize;
  uniform vec2 uDepth;   // depth range used for the fade-with-distance cue
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    bool solid = aAlpha >= 0.999;
    bool show = uPass < 0.5 ? solid : (aAlpha > 0.0 && !solid);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    if (!show) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uSize * uPxScale * sqrt(uScale / -mv.z), 1.5, uMaxSize * (0.6 + 0.4 * aSize));
    float fade = smoothstep(uDepth.x, uDepth.y, -mv.z);
    vColor = aColor * (1.0 - 0.5 * fade);
    vAlpha = aAlpha;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uPass;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
    float light = 0.6 + 0.4 * max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
    vec3 col = vColor * light;
    if (uPass < 0.5) {
      gl_FragColor = vec4(col, 1.0 - smoothstep(0.8, 1.0, r2));
    } else {
      gl_FragColor = vec4(col, vAlpha * (1.0 - smoothstep(0.5, 1.0, r2)));
    }
  }
`;

function makeMaterial(pass: 0 | 1) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSize: { value: 1 },
      uScale: { value: 500 },
      uPass: { value: pass },
      uMaxSize: { value: MAX_POINT_PX },
      uPxScale: { value: SIZE_GAIN },
      uDepth: { value: new THREE.Vector2(100, 400) },
    },
    transparent: pass === 1,
    depthWrite: pass === 0,
    alphaToCoverage: pass === 0,
  });
}

interface Props {
  animator: LayoutAnimator;
  colors: Float32Array;
  targets: Targets;
  pointSize: number;
}

/**
 * All songs as one geometry, drawn twice: solid points first (they write depth),
 * then dimmed points as a faint transparent layer.
 */
export function PointCloud({ animator, colors, targets, pointSize }: Props) {
  const geometry = useMemo(() => {
    const n = animator.current.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(animator.current, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [animator]);
  const solid = useMemo(() => makeMaterial(0), []);
  const faded = useMemo(() => makeMaterial(1), []);
  const lastVersion = useRef(-1);

  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);
  useEffect(() => () => {
    solid.dispose();
    faded.dispose();
  }, [solid, faded]);

  useEffect(() => {
    const a = geometry.getAttribute("aColor") as THREE.BufferAttribute;
    (a.array as Float32Array).set(colors);
    a.needsUpdate = true;
  }, [geometry, colors]);

  useEffect(() => {
    const a = geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const s = geometry.getAttribute("aSize") as THREE.BufferAttribute;
    (a.array as Float32Array).set(targets.alpha);
    (s.array as Float32Array).set(targets.size);
    a.needsUpdate = true;
    s.needsUpdate = true;
  }, [geometry, targets]);

  useFrame((state) => {
    animator.tick(state.clock.elapsedTime);
    if (animator.version !== lastVersion.current) {
      lastVersion.current = animator.version;
      geometry.getAttribute("position").needsUpdate = true;
    }
    const cam = state.camera as THREE.PerspectiveCamera;
    const scale = pointScale(state.size.height * state.viewport.dpr, cam.fov);
    const target = (state.controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    const d = target ? cam.position.distanceTo(target) : 250;
    for (const m of [solid, faded]) {
      m.uniforms.uSize.value = pointSize;
      m.uniforms.uScale.value = scale;
      m.uniforms.uMaxSize.value = MAX_POINT_PX * state.viewport.dpr * Math.sqrt(pointSize);
      m.uniforms.uPxScale.value = SIZE_GAIN * Math.sqrt(state.viewport.dpr);
      (m.uniforms.uDepth.value as THREE.Vector2).set(d * 0.8, d * 2.2);
    }
  });

  return (
    <>
      <points geometry={geometry} material={solid} frustumCulled={false} renderOrder={1} />
      <points geometry={geometry} material={faded} frustumCulled={false} renderOrder={2} />
    </>
  );
}
