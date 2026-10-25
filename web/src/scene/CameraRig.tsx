import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { ISLAND_SCALE } from "../lib/islands";
import { frameTargets } from "../lib/targets";
import type { FocusRequest, GraphData, Targets } from "../types";

interface Props {
  data: GraphData;
  request: FocusRequest | null;
  targets: Targets;
  /** The song panel covers the right side of the canvas while it is open. */
  songPanelOpen: boolean;
  sidebarOpen: boolean;
}

interface Flight {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  t0: THREE.Vector3;
  t1: THREE.Vector3;
  start: number;
  duration: number;
}

/** Width of the left sidebar plus its margin; matches styles.css. */
export const PANEL_SPACE = 324;
/** Width of the right song panel plus its margin; matches styles.css. */
const SONG_PANEL_SPACE = 384;
/** Below this width the panels overlay the canvas instead of sitting beside it. */
export const WIDE_LAYOUT = 900;

/** Smoothly moves the camera and orbit target: frame the view, a song, a topic, or zoom. */
export function CameraRig({ data, request, targets, songPanelOpen, sidebarOpen }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const get = useThree((s) => s.get);
  const flight = useRef<Flight | null>(null);
  const latest = useRef({ targets, songPanelOpen, sidebarOpen });
  latest.current = { targets, songPanelOpen, sidebarOpen };

  useEffect(() => {
    if (!request || !controls) return;
    const { size, clock } = get();
    const t = latest.current.targets;
    const p = t.positions;
    const wide = size.width > WIDE_LAYOUT;
    const rightSpace = wide && latest.current.songPanelOpen ? SONG_PANEL_SPACE : 0;
    const usableWidth = size.width - (wide && latest.current.sidebarOpen ? PANEL_SPACE : 0) - rightSpace;
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (usableWidth / size.height));
    const fitDistance = (radius: number) => (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
    const currentDistance = camera.position.distanceTo(controls.target);

    let center: THREE.Vector3;
    let dist: number;
    let duration = 1.1;
    switch (request.kind) {
      case "fit": {
        const f = frameTargets(t);
        center = new THREE.Vector3(...f.center);
        // The focus graph has labels beside each node and the toolbar below, so leave room.
        dist = fitDistance(f.radius * (t.layout === "focus" ? 1.4 : 1.12));
        break;
      }
      case "song": {
        const s = request.song;
        center = new THREE.Vector3(p[s * 3], p[s * 3 + 1], p[s * 3 + 2]);
        // Wide enough to show the song's neighbourhood instead of flying into the cloud.
        dist = fitDistance(t.layout === "global" ? 40 : 24);
        break;
      }
      case "center": {
        const s = request.song;
        center = new THREE.Vector3(p[s * 3], p[s * 3 + 1], p[s * 3 + 2]);
        dist = currentDistance;
        duration = 0.7;
        break;
      }
      case "topic": {
        const c = request.topic;
        const tc = t.topicCenters;
        center = new THREE.Vector3(tc[c * 3], tc[c * 3 + 1], tc[c * 3 + 2]);
        dist = fitDistance(data.topicRadius[c] * ISLAND_SCALE * 1.7);
        break;
      }
      case "zoom": {
        center = controls.target.clone();
        dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, currentDistance * request.factor));
        duration = 0.45;
        break;
      }
      default:
        return;
    }

    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    // The projection is already centred beside the left panel (see PanelOffset). With the
    // song panel open, aim right of the content so it lands in the middle of the free area.
    let target = center;
    if (request.kind !== "zoom" && rightSpace > 0) {
      const worldPerPx = (2 * dist * Math.tan(vFov / 2)) / size.height;
      const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
      target = center.clone().addScaledVector(right, (rightSpace / 2) * worldPerPx);
    }
    flight.current = {
      p0: camera.position.clone(),
      p1: target.clone().addScaledVector(dir, dist),
      t0: controls.target.clone(),
      t1: target,
      start: clock.elapsedTime,
      duration,
    };
  }, [request, controls, camera, get, data]);

  // Any user drag or zoom cancels the flight.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => (flight.current = null);
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((state) => {
    const f = flight.current;
    if (!f || !controls) return;
    const t = Math.min(1, (state.clock.elapsedTime - f.start) / f.duration);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(f.p0, f.p1, e);
    controls.target.lerpVectors(f.t0, f.t1, e);
    controls.update();
    if (t >= 1) flight.current = null;
  });

  return null;
}
