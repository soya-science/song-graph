import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadGraph } from "./data/loadGraph";
import { buildArtistPalette, buildColors, paletteCss } from "./lib/colors";
import { buildEgoGraph } from "./lib/focus";
import { computeEdges, computeTargets } from "./lib/targets";
import { GraphCanvas } from "./scene/GraphCanvas";
import type { ColorMode, EdgeMode, FilterMode, FocusRequest, GraphData, LayoutMode } from "./types";
import { HelpOverlay } from "./ui/HelpOverlay";
import { LogoIcon } from "./ui/icons";
import { Sidebar } from "./ui/Sidebar";
import { SongPanel } from "./ui/SongPanel";
import { Toolbar } from "./ui/Toolbar";
import { ViewSettings } from "./ui/ViewSettings";

export default function App() {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGraph().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="splash">
        <div className="brand-mark big">
          <LogoIcon size={30} />
        </div>
        <h1>Song Graph</h1>
        <p className="error">{error}</p>
        <p className="hint">Run the pipeline in pipeline/ to generate web/public/data/.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="splash">
        <div className="brand-mark big">
          <LogoIcon size={30} />
        </div>
        <h1>Song Graph</h1>
        <div className="spinner" />
        <p className="hint">Loading 57,650 songs…</p>
      </div>
    );
  }
  return <Explorer data={data} />;
}

type Hops = 1 | 2;

function Explorer({ data }: { data: GraphData }) {
  // What is shown
  const [selectedArtists, setSelectedArtists] = useState<number[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("highlight");
  const [layout, setLayout] = useState<LayoutMode>("global");
  const [hoverTopic, setHoverTopic] = useState<number | null>(null);
  // Display settings
  const [colorMode, setColorMode] = useState<ColorMode>("topic");
  const [spacing, setSpacing] = useState(1);
  const [showTopics, setShowTopics] = useState(true);
  const [pointSize, setPointSize] = useState(1.2);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("filtered");
  const [edgeK, setEdgeK] = useState(3);
  const [minSim, setMinSim] = useState(data.simRange[0]);
  const [withinFilter, setWithinFilter] = useState(false);
  const [crossTopics, setCrossTopics] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  // Selection, focus graph and history
  const [hovered, setHovered] = useState<number | null>(null);
  const [selectedSong, setSelectedSong] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusAnchor, setFocusAnchor] = useState<number | null>(null);
  const [hops, setHops] = useState<Hops>(1);
  const [history, setHistory] = useState<{ list: number[]; index: number }>({ list: [], index: -1 });
  // Chrome
  const narrow = () => window.innerWidth <= 900;
  const [sidebarOpen, setSidebarOpen] = useState(() => !narrow());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [cameraRequest, setCameraRequest] = useState<FocusRequest | null>(null);
  const nextId = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const requestFit = useCallback(() => setCameraRequest({ kind: "fit", id: nextId.current++ }), []);
  const flyToSong = useCallback((song: number) => setCameraRequest({ kind: "song", song, id: nextId.current++ }), []);
  const centerOn = useCallback((song: number) => setCameraRequest({ kind: "center", song, id: nextId.current++ }), []);
  const flyToTopic = useCallback((topic: number) => setCameraRequest({ kind: "topic", topic, id: nextId.current++ }), []);
  const zoom = useCallback((factor: number) => setCameraRequest({ kind: "zoom", factor, id: nextId.current++ }), []);

  const focusActive = focusMode && selectedSong !== null;
  const graph = useMemo(
    () => (focusActive ? buildEgoGraph(data, selectedSong!, hops) : null),
    [data, focusActive, selectedSong, hops],
  );

  const targets = useMemo(
    () =>
      computeTargets(data, {
        selectedArtists,
        filterMode,
        layout,
        selectedSong,
        spacing,
        focus: graph ? { graph, anchor: focusAnchor ?? graph.center } : null,
        hoverTopic,
      }),
    [data, selectedArtists, filterMode, layout, selectedSong, spacing, graph, focusAnchor, hoverTopic],
  );
  const shownLayout = targets.layout;

  const palette = useMemo(
    () => buildArtistPalette(data.meta.artists.length, selectedArtists),
    [data, selectedArtists],
  );
  const colorOf = useCallback((a: number) => paletteCss(palette, a), [palette]);
  const colors = useMemo(
    () => buildColors(data, colorMode, palette, selectedArtists),
    [data, colorMode, palette, selectedArtists],
  );
  const edges = useMemo(
    () =>
      computeEdges(data, targets, {
        mode: edgeMode,
        hasSelection: selectedArtists.length > 0,
        k: edgeK,
        minSim,
        withinFilter,
        crossTopics,
      }),
    [data, targets, edgeMode, selectedArtists, edgeK, minSim, withinFilter, crossTopics],
  );

  // Thick links: the whole focus graph, or the open song's links on the map.
  const links = useMemo(() => {
    const [lo] = data.simRange;
    const pairs: number[] = [];
    const cols: number[] = [];
    const push = (a: number, b: number, sim: number, center: boolean) => {
      const t = Math.max(0, Math.min(1, (sim - lo) / (1 - lo)));
      const shade = 0.45 + 0.55 * t;
      for (const s of [a, b]) {
        pairs.push(s);
        if (center) cols.push(0.95 * shade + 0.05, 0.95 * shade + 0.05, shade);
        else cols.push(colors[s * 3] * shade, colors[s * 3 + 1] * shade, colors[s * 3 + 2] * shade);
      }
    };
    if (graph) {
      for (let e = 0; e < graph.edges.length / 2; e++) {
        const a = graph.edges[e * 2];
        const b = graph.edges[e * 2 + 1];
        push(a, b, graph.edgeSim[e], a === graph.center || b === graph.center);
      }
    } else if (selectedSong !== null) {
      const a = data.songArtist[selectedSong];
      for (let r = 0; r < data.k; r++) {
        const j = data.knnIdx[selectedSong * data.k + r];
        if (targets.alpha[j] < 1) continue;
        if (shownLayout === "artist" && data.songArtist[j] !== a) continue;
        push(selectedSong, j, data.knnSim[selectedSong * data.k + r], true);
      }
    }
    return { edges: Uint32Array.from(pairs), colors: Float32Array.from(cols) };
  }, [data, graph, selectedSong, targets, shownLayout, colors]);

  // Re-frame the camera when what is shown changes shape (not when merely highlighting).
  const reframes = shownLayout === "artist" || filterMode === "isolate";
  const fitKey = `${shownLayout === "focus" ? "global" : shownLayout}|${filterMode}|${reframes ? selectedArtists.join(",") : ""}`;
  useEffect(() => {
    if (!focusActive) requestFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, requestFit]);

  // Frame the focus graph whenever it is built or rebuilt around a new song.
  useEffect(() => {
    if (graph) requestFit();
  }, [graph, requestFit]);

  // Re-frame shortly after the spacing slider stops moving, so islands stay in view.
  const firstSpacing = useRef(true);
  useEffect(() => {
    if (firstSpacing.current) {
      firstSpacing.current = false;
      return;
    }
    const t = setTimeout(requestFit, 400);
    return () => clearTimeout(t);
  }, [spacing, requestFit]);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 10000);
    return () => clearTimeout(t);
  }, []);

  const addArtist = useCallback((a: number) => {
    setSelectedArtists((cur) => (cur.includes(a) ? cur : [...cur, a]));
  }, []);
  const removeArtist = useCallback((a: number) => {
    setSelectedArtists((cur) => cur.filter((x) => x !== a));
  }, []);

  /** Open a song. `camera` says how to move the view to it. */
  const openSong = useCallback(
    (song: number, camera: "fly" | "center" | "none", recordHistory = true) => {
      setSelectedSong(song);
      setShowHint(false);
      if (narrow()) setSidebarOpen(false); // on phones the song panel needs the room
      if (recordHistory) {
        setHistory((h) => {
          if (h.list[h.index] === song) return h;
          const list = h.list.slice(0, h.index + 1).concat(song).slice(-200);
          return { list, index: list.length - 1 };
        });
      }
      if (focusMode) return; // the focus graph re-centres itself and re-frames
      const a = data.songArtist[song];
      if (shownLayout === "artist" && !selectedArtists.includes(a)) addArtist(a);
      if (camera === "fly") flyToSong(song);
      if (camera === "center") centerOn(song);
    },
    [data, focusMode, shownLayout, selectedArtists, addArtist, flyToSong, centerOn],
  );

  const closeSong = useCallback(() => {
    setSelectedSong(null);
    setFocusMode(false);
    setFocusAnchor(null);
  }, []);

  const setFocus = useCallback(
    (on: boolean) => {
      if (selectedSong === null) return;
      setFocusMode(on);
      setFocusAnchor(on ? selectedSong : null);
      if (!on) flyToSong(selectedSong);
    },
    [selectedSong, flyToSong],
  );

  const goHistory = useCallback(
    (delta: number) => {
      const i = history.index + delta;
      if (i < 0 || i >= history.list.length) return;
      setHistory({ ...history, index: i });
      openSong(history.list[i], "fly", false);
    },
    [history, openSong],
  );

  const onCanvasClick = useCallback(
    (song: number | null) => {
      if (song === null) {
        if (!focusMode) setSelectedSong(null);
        return;
      }
      openSong(song, "center");
    },
    [focusMode, openSong],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (!typing && focusActive) setFocus(false);
        else if (!typing && selectedSong !== null) closeSong();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey) return;
      if (e.altKey && e.key === "ArrowLeft") return goHistory(-1);
      if (e.altKey && e.key === "ArrowRight") return goHistory(1);
      switch (e.key) {
        case "/":
          e.preventDefault();
          if (searchRef.current) searchRef.current.focus();
          else {
            setSidebarOpen(true);
            setTimeout(() => searchRef.current?.focus(), 0);
          }
          break;
        case "?":
          setHelpOpen((v) => !v);
          break;
        case "g":
        case "G":
          if (selectedSong !== null) setFocus(!focusActive);
          break;
        case "1":
          if (focusActive) setHops(1);
          break;
        case "2":
          if (focusActive) setHops(2);
          break;
        case "[":
          goHistory(-1);
          break;
        case "]":
          goHistory(1);
          break;
        case "f":
        case "F":
          requestFit();
          break;
        case "+":
        case "=":
          zoom(1 / 1.5);
          break;
        case "-":
        case "_":
          zoom(1.5);
          break;
        case "r":
        case "R":
          setAutoRotate((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen, settingsOpen, focusActive, selectedSong, setFocus, closeSong, goHistory, requestFit, zoom]);

  return (
    <div className={`app ${sidebarOpen ? "with-sidebar" : ""}`}>
      <GraphCanvas
        data={data}
        targets={targets}
        colors={colors}
        edges={edges}
        links={links}
        pointSize={pointSize}
        hovered={hovered}
        selected={selectedSong}
        cameraRequest={cameraRequest}
        autoRotate={autoRotate}
        showTopics={showTopics}
        hoverTopic={hoverTopic}
        dimNebulae={selectedArtists.length > 0}
        sidebarOpen={sidebarOpen}
        onHover={setHovered}
        onClick={onCanvasClick}
        onDoubleClick={(s) => {
          openSong(s, "none");
          if (!focusMode) flyToSong(s);
        }}
        onTopicClick={flyToTopic}
        onTopicHover={setHoverTopic}
        colorOf={colorOf}
      />

      <Sidebar
        data={data}
        searchRef={searchRef}
        selectedArtists={selectedArtists}
        onAddArtist={addArtist}
        onRemoveArtist={removeArtist}
        onClearArtists={() => setSelectedArtists([])}
        onPickSong={(s) => openSong(s, "fly")}
        onTopicClick={flyToTopic}
        hoverTopic={hoverTopic}
        onTopicHover={setHoverTopic}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        layout={layout}
        shownLayout={shownLayout}
        setLayout={setLayout}
        visibleCount={targets.visibleCount}
        colorOf={colorOf}
        open={sidebarOpen}
        setOpen={setSidebarOpen}
      />

      {focusActive && (
        <div className="focus-banner glass">
          <span className="focus-dot" />
          Connections of <strong>{data.meta.titles[selectedSong!]}</strong>
          <button className="link-btn" onClick={() => setFocus(false)}>
            Show all songs <kbd>Esc</kbd>
          </button>
        </div>
      )}

      {selectedSong !== null && (
        <SongPanel
          data={data}
          song={selectedSong}
          focusMode={focusActive}
          hops={hops}
          onToggleFocus={() => setFocus(!focusActive)}
          onHops={setHops}
          isArtistSelected={selectedArtists.includes(data.songArtist[selectedSong])}
          onClose={closeSong}
          onSelect={(s) => openSong(s, "fly")}
          onFly={() => flyToSong(selectedSong)}
          onAddArtist={addArtist}
          onTopicClick={(t) => {
            if (focusActive) setFocus(false);
            flyToTopic(t);
          }}
          colorOf={colorOf}
        />
      )}

      {settingsOpen && (
        <ViewSettings
          data={data}
          onClose={() => setSettingsOpen(false)}
          spacing={spacing}
          setSpacing={setSpacing}
          showTopics={showTopics}
          setShowTopics={setShowTopics}
          colorMode={colorMode}
          setColorMode={setColorMode}
          pointSize={pointSize}
          setPointSize={setPointSize}
          edgeMode={edgeMode}
          setEdgeMode={setEdgeMode}
          edgeK={edgeK}
          setEdgeK={setEdgeK}
          minSim={minSim}
          setMinSim={setMinSim}
          crossTopics={crossTopics}
          setCrossTopics={setCrossTopics}
          withinFilter={withinFilter}
          setWithinFilter={setWithinFilter}
          hasArtistFilter={selectedArtists.length > 0}
        />
      )}

      {showHint && selectedSong === null && (
        <div className="hint-toast glass">
          Click any song to explore its connections · <kbd>?</kbd> for help
        </div>
      )}

      <Toolbar
        canBack={history.index > 0}
        canForward={history.index < history.list.length - 1}
        onBack={() => goHistory(-1)}
        onForward={() => goHistory(1)}
        onFit={requestFit}
        onZoom={zoom}
        autoRotate={autoRotate}
        onAutoRotate={() => setAutoRotate((v) => !v)}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((v) => !v)}
        onHelp={() => setHelpOpen(true)}
      />

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
