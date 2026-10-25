import { useEffect, useRef } from "react";
import type { ColorMode, EdgeMode, GraphData } from "../types";
import { CloseIcon } from "./icons";
import { Segmented } from "./Segmented";

export interface ViewSettingsProps {
  data: GraphData;
  onClose: () => void;
  spacing: number;
  setSpacing: (v: number) => void;
  showTopics: boolean;
  setShowTopics: (v: boolean) => void;
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  pointSize: number;
  setPointSize: (v: number) => void;
  edgeMode: EdgeMode;
  setEdgeMode: (m: EdgeMode) => void;
  edgeK: number;
  setEdgeK: (v: number) => void;
  minSim: number;
  setMinSim: (v: number) => void;
  crossTopics: boolean;
  setCrossTopics: (v: boolean) => void;
  withinFilter: boolean;
  setWithinFilter: (v: boolean) => void;
  hasArtistFilter: boolean;
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="slider">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(+e.target.value)}
      />
      <output>{props.format ? props.format(props.value) : props.value}</output>
    </label>
  );
}

/** Popover with the less frequently used display options. */
export function ViewSettings(p: ViewSettingsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(p.onClose);
  close.current = p.onClose;
  // Clicking anywhere outside (except the toolbar, which toggles it) closes the popover.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(t) && !t.closest(".toolbar")) close.current();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <div className="settings glass" ref={ref} role="dialog" aria-label="Display settings">
      <header className="settings-header">
        <h2>Display</h2>
        <button className="icon-btn ghost" onClick={p.onClose} aria-label="Close">
          <CloseIcon size={16} />
        </button>
      </header>

      <section>
        <div className="section-label">Map</div>
        <Slider label="Island spacing" min={0} max={2} step={0.05} value={p.spacing} onChange={p.setSpacing} format={(v) => v.toFixed(2)} />
        <Slider label="Point size" min={0.4} max={3} step={0.05} value={p.pointSize} onChange={p.setPointSize} format={(v) => v.toFixed(2)} />
        <label className="check">
          <input type="checkbox" checked={p.showTopics} onChange={(e) => p.setShowTopics(e.target.checked)} />
          Topic labels
        </label>
      </section>

      <section>
        <div className="section-label">Colour songs by</div>
        <Segmented
          value={p.colorMode}
          onChange={p.setColorMode}
          size="sm"
          options={[
            { value: "topic", label: "Topic" },
            { value: "position", label: "Position" },
            { value: "artist", label: "Artist" },
          ]}
        />
      </section>

      <section>
        <div className="section-label">Similarity lines on the map</div>
        <Segmented
          value={p.edgeMode}
          onChange={p.setEdgeMode}
          size="sm"
          options={[
            { value: "off", label: "Off" },
            { value: "filtered", label: "Filtered artists" },
            { value: "all", label: "All songs" },
          ]}
        />
        <fieldset disabled={p.edgeMode === "off"}>
          <Slider label="Neighbours" min={1} max={p.data.k} step={1} value={p.edgeK} onChange={p.setEdgeK} />
          <Slider
            label="Min. similarity"
            min={p.data.simRange[0]}
            max={p.data.simRange[1]}
            step={0.005}
            value={p.minSim}
            onChange={p.setMinSim}
            format={(v) => v.toFixed(3)}
          />
          <label className="check">
            <input type="checkbox" checked={p.crossTopics} onChange={(e) => p.setCrossTopics(e.target.checked)} />
            Lines across topics
          </label>
          {p.hasArtistFilter && (
            <label className="check">
              <input type="checkbox" checked={p.withinFilter} onChange={(e) => p.setWithinFilter(e.target.checked)} />
              Only between selected artists
            </label>
          )}
        </fieldset>
      </section>
    </div>
  );
}
