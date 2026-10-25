import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { topicColor } from "../lib/colors";
import { ISLAND_SCALE } from "../lib/islands";
import type { GraphData, Targets } from "../types";

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Props {
  data: GraphData;
  targets: Targets;
  hoverTopic: number | null;
  dimmed: boolean;
}

/** A soft coloured glow behind each topic island. */
export function Nebulae({ data, targets, hoverTopic, dimmed }: Props) {
  const k = data.meta.topics.length;
  const texture = useMemo(glowTexture, []);
  const sprites = useMemo(
    () =>
      Array.from({ length: k }, (_, c) => {
        const [r, g, b] = topicColor(c);
        const m = new THREE.SpriteMaterial({
          map: texture,
          color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          opacity: 0,
          toneMapped: false,
        });
        const s = new THREE.Sprite(m);
        s.position.set(data.topicCenter[c * 3], data.topicCenter[c * 3 + 1], data.topicCenter[c * 3 + 2]);
        s.renderOrder = -1;
        return s;
      }),
    [data, k, texture],
  );

  useEffect(
    () => () => {
      sprites.forEach((s) => s.material.dispose());
      texture.dispose();
    },
    [sprites, texture],
  );

  useFrame((_, delta) => {
    const ease = 1 - Math.exp(-delta * 5);
    const global = targets.layout === "global";
    sprites.forEach((s, c) => {
      const want = !global || !targets.topicShown[c]
        ? 0
        : hoverTopic === null
          ? dimmed ? 0.07 : 0.2
          : hoverTopic === c ? 0.38 : 0.05;
      const m = s.material;
      m.opacity += (want - m.opacity) * ease;
      s.visible = m.opacity > 0.003;
      const tc = targets.topicCenters;
      s.position.x += (tc[c * 3] - s.position.x) * ease;
      s.position.y += (tc[c * 3 + 1] - s.position.y) * ease;
      s.position.z += (tc[c * 3 + 2] - s.position.z) * ease;
      s.scale.setScalar(data.topicRadius[c] * ISLAND_SCALE * 3.4);
    });
  });

  return (
    <>
      {sprites.map((s, c) => (
        <primitive key={c} object={s} />
      ))}
    </>
  );
}
