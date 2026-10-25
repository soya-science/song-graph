import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { LayoutAnimator } from "../lib/animator";
import type { Targets } from "../types";
import { pointDiameter, pointScale } from "./PointCloud";

interface Props {
  animator: LayoutAnimator;
  targets: Targets;
  pointSize: number;
  onHover: (song: number | null) => void;
  onClick: (song: number | null) => void;
  onDoubleClick: (song: number) => void;
}

const viewProj = new THREE.Matrix4();

/**
 * Screen-space picking: project every visible point and take the front-most one
 * under the pointer. Solid points win over dimmed ones. Runs at most once a frame,
 * and only when the pointer, camera or layout changed.
 */
export function Picker({ animator, targets, pointSize, onHover, onClick, onDoubleClick }: Props) {
  const gl = useThree((s) => s.gl);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(true);
  const hovered = useRef<number | null>(null);
  const lastCam = useRef(new THREE.Matrix4());
  const lastVersion = useRef(-1);
  const cb = useRef({ onHover, onClick, onDoubleClick });
  cb.current = { onHover, onClick, onDoubleClick };

  useEffect(() => {
    dirty.current = true;
  }, [targets, pointSize]);

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    let lastClick = { time: 0, song: null as number | null };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      dirty.current = true;
    };
    const leave = () => {
      pointer.current = null;
      dirty.current = true;
    };
    const pdown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pup = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && e.button === 0) {
        const song = hovered.current;
        const now = performance.now();
        if (song !== null && song === lastClick.song && now - lastClick.time < 350) {
          cb.current.onDoubleClick(song);
          lastClick = { time: 0, song: null };
        } else {
          cb.current.onClick(song);
          lastClick = { time: now, song };
        }
      }
      down = null;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointerup", pup);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointerup", pup);
    };
  }, [gl]);

  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    animator.tick(state.clock.elapsedTime);
    cam.updateMatrixWorld();
    const camMoved = !lastCam.current.equals(cam.matrixWorld);
    if (!dirty.current && !camMoved && lastVersion.current === animator.version) return;
    dirty.current = false;
    lastCam.current.copy(cam.matrixWorld);
    lastVersion.current = animator.version;

    let best: number | null = null;
    const p = pointer.current;
    if (p) {
      const { width: W, height: H } = state.size;
      viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const e = viewProj.elements;
      const pos = animator.current;
      const { alpha, size } = targets;
      const scaleCss = pointScale(H, cam.fov);
      let bestSolid = false;
      let bestW = Infinity;
      for (let i = 0; i < alpha.length; i++) {
        const a = alpha[i];
        if (a <= 0) continue;
        const solid = a >= 1;
        if (bestSolid && !solid) continue;
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        if (w <= 0.1) continue;
        const sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * 0.5 + 0.5) * W;
        const dx = sx - p.x;
        const r = Math.max(5, pointDiameter(size[i], pointSize, scaleCss, w) / 2 + 1.5);
        if (dx > r || dx < -r) continue;
        const sy = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w * 0.5) * H;
        const dy = sy - p.y;
        if (dx * dx + dy * dy > r * r) continue;
        if ((solid && !bestSolid) || w < bestW) {
          best = i;
          bestW = w;
          bestSolid = solid;
        }
      }
    }
    if (best !== hovered.current) {
      hovered.current = best;
      gl.domElement.style.cursor = best === null ? "" : "pointer";
      cb.current.onHover(best);
    }
  });

  return null;
}
