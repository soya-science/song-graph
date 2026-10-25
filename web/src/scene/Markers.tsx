import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { LayoutAnimator } from "../lib/animator";
import type { Targets } from "../types";

const at = new THREE.Vector3();

interface MarkerProps {
  animator: LayoutAnimator;
  song: number;
  color: string;
  ringScale: number;
  pulse?: boolean;
}

/** A ring that faces the camera, keeps a constant screen size, and follows one song. */
function Marker({ animator, song, color, ringScale, pulse }: MarkerProps) {
  const ring = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    animator.tick(state.clock.elapsedTime);
    const c = animator.current;
    const d = state.camera.position.distanceTo(at.set(c[song * 3], c[song * 3 + 1], c[song * 3 + 2]));
    const beat = pulse ? 1 + 0.12 * Math.sin(state.clock.elapsedTime * 3.2) : 1;
    for (const m of [ring.current, halo.current]) {
      if (!m) continue;
      m.position.set(c[song * 3], c[song * 3 + 1], c[song * 3 + 2]);
      m.quaternion.copy(state.camera.quaternion);
    }
    ring.current?.scale.setScalar(d * 0.014 * ringScale * beat);
    if (halo.current) {
      halo.current.scale.setScalar(d * 0.014 * ringScale * (1.5 + 0.5 * (beat - 1) * 6));
      (halo.current.material as THREE.MeshBasicMaterial).opacity = pulse ? 0.18 - (beat - 1) * 0.6 : 0;
    }
  });
  return (
    <>
      <mesh ref={halo} renderOrder={9} frustumCulled={false}>
        <ringGeometry args={[0.85, 1, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ring} renderOrder={10} frustumCulled={false}>
        <ringGeometry args={[0.72, 1, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

interface Props {
  animator: LayoutAnimator;
  targets: Targets;
  hovered: number | null;
  selected: number | null;
}

export function Markers({ animator, targets, hovered, selected }: Props) {
  return (
    <>
      {selected !== null && targets.alpha[selected] > 0 && (
        <Marker animator={animator} song={selected} color="#ffffff" ringScale={1.25} pulse />
      )}
      {hovered !== null && hovered !== selected && (
        <Marker animator={animator} song={hovered} color="#ffd36b" ringScale={0.9} />
      )}
    </>
  );
}
