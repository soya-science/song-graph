import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LayoutAnimator } from "../lib/animator";
import type { FocusRequest, GraphData, Targets } from "../types";
import { Backdrop } from "./Backdrop";
import { CameraRig, PANEL_SPACE, WIDE_LAYOUT } from "./CameraRig";
import { Edges, edgeOpacity } from "./Edges";
import { FatEdges } from "./FatEdges";
import { LabelOverlay, LabelProjector, type LabelRegistry } from "./Labels";
import { Markers } from "./Markers";
import { Nebulae } from "./Nebulae";
import { Picker } from "./Picker";
import { PointCloud } from "./PointCloud";

export interface SceneProps {
  data: GraphData;
  targets: Targets;
  colors: Float32Array;
  /** Thin similarity edges for the filtered map. */
  edges: Uint32Array;
  /** Thick links: the focus graph, or the selected song's links on the map. */
  links: { edges: Uint32Array; colors: Float32Array };
  pointSize: number;
  hovered: number | null;
  selected: number | null;
  cameraRequest: FocusRequest | null;
  autoRotate: boolean;
  showTopics: boolean;
  hoverTopic: number | null;
  /** An artist filter is active, so island glows are toned down. */
  dimNebulae: boolean;
  /** The left sidebar covers part of the canvas while it is open. */
  sidebarOpen: boolean;
  onHover: (song: number | null) => void;
  onClick: (song: number | null) => void;
  onDoubleClick: (song: number) => void;
  onTopicClick: (topic: number) => void;
  onTopicHover: (topic: number | null) => void;
  colorOf: (artist: number) => string;
}

/** Shift the projection right so the orbit centre sits in the middle of the area beside the sidebar. */
function PanelOffset({ open }: { open: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (open && size.width > WIDE_LAYOUT) {
      camera.setViewOffset(size.width, size.height, -PANEL_SPACE / 2, 0, size.width, size.height);
    } else {
      camera.clearViewOffset();
    }
  }, [camera, size, open]);
  return null;
}

/** three.js OrbitControls, registered as the scene's default controls. */
function Controls({ autoRotate }: { autoRotate: boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const set = useThree((s) => s.set);
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 1.1;
    controls.panSpeed = 0.9;
    controls.zoomToCursor = true;
    controls.minDistance = 2;
    controls.maxDistance = 2200;
    controls.autoRotateSpeed = 0.4;
    set({ controls });
    return () => {
      set({ controls: null });
      controls.dispose();
    };
  }, [controls, set]);

  useEffect(() => {
    controls.autoRotate = autoRotate;
  }, [controls, autoRotate]);

  useFrame((_, delta) => controls.update(delta), -1);
  return null;
}

interface InnerProps extends SceneProps {
  animator: LayoutAnimator;
  registry: LabelRegistry;
}

function Scene(p: InnerProps) {
  const clock = useThree((s) => s.clock);
  const { animator } = p;

  useEffect(() => {
    if (animator.to !== p.targets.positions) animator.setTarget(p.targets.positions, clock.elapsedTime);
  }, [animator, p.targets.positions, clock]);

  const focus = p.targets.layout === "focus";
  return (
    <>
      <Backdrop />
      <PanelOffset open={p.sidebarOpen} />
      <Nebulae data={p.data} targets={p.targets} hoverTopic={p.hoverTopic} dimmed={p.dimNebulae || p.selected !== null} />
      <PointCloud animator={animator} colors={p.colors} targets={p.targets} pointSize={p.pointSize} />
      <Edges animator={animator} edges={p.edges} colors={p.colors} opacity={edgeOpacity(p.edges.length / 2)} />
      <FatEdges
        animator={animator}
        edges={p.links.edges}
        colors={p.links.colors}
        width={focus ? 2.2 : 1.6}
        opacity={focus ? 0.9 : 0.75}
      />
      <Markers animator={animator} targets={p.targets} hovered={p.hovered} selected={p.selected} />
      <Picker
        animator={animator}
        targets={p.targets}
        pointSize={p.pointSize}
        onHover={p.onHover}
        onClick={p.onClick}
        onDoubleClick={p.onDoubleClick}
      />
      <CameraRig
        data={p.data}
        request={p.cameraRequest}
        targets={p.targets}
        songPanelOpen={p.selected !== null}
        sidebarOpen={p.sidebarOpen}
      />
      <LabelProjector registry={p.registry} />
    </>
  );
}

export function GraphCanvas(props: SceneProps) {
  // Shared between the 3D scene and the DOM label layer.
  const animator = useMemo(() => new LayoutAnimator(props.targets.positions), [props.data]);
  const registry = useMemo<LabelRegistry>(() => new Map(), []);

  return (
    <div className="graph-wrap">
      <Canvas
        className="graph-canvas"
        flat
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 60, 300], fov: 50, near: 0.5, far: 7000 }}
      >
        <Scene {...props} animator={animator} registry={registry} />
        <Controls autoRotate={props.autoRotate} />
      </Canvas>
      <LabelOverlay
        data={props.data}
        targets={props.targets}
        animator={animator}
        hovered={props.hovered}
        selected={props.selected}
        registry={registry}
        colorOf={props.colorOf}
        showTopics={props.showTopics}
        hoverTopic={props.hoverTopic}
        onTopicClick={props.onTopicClick}
        onTopicHover={props.onTopicHover}
        onSongClick={(s) => props.onClick(s)}
      />
    </div>
  );
}
