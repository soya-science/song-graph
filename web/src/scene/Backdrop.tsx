import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Deep-blue radial gradient behind everything, plus a faint starfield for orientation. */
export function Backdrop() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(300, 230, 0, 256, 256, 420);
    grad.addColorStop(0, "#131c33");
    grad.addColorStop(0.45, "#0a0f1d");
    grad.addColorStop(1, "#04060b");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    return () => {
      scene.background = null;
      tex.dispose();
    };
  }, [scene]);

  const stars = useMemo(() => {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const r = 2000 + rand() * 900;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3);
      const b = 0.35 + rand() * 0.5;
      col.set([b * 0.85, b * 0.9, b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      toneMapped: false,
    });
    const p = new THREE.Points(geo, mat);
    p.renderOrder = -2;
    p.frustumCulled = false;
    return p;
  }, []);

  useEffect(
    () => () => {
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
    },
    [stars],
  );

  return <primitive object={stars} />;
}
