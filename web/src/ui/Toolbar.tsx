import type { ReactNode } from "react";
import { BackIcon, FitIcon, ForwardIcon, HelpIcon, MinusIcon, PlusIcon, RotateIcon, SlidersIcon } from "./icons";

interface ToolProps {
  label: string;
  keys?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}

function Tool({ label, keys, onClick, disabled, active, children }: ToolProps) {
  return (
    <button
      className={`tool ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tip={keys ? `${label}  ${keys}` : label}
    >
      {children}
    </button>
  );
}

interface Props {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
  autoRotate: boolean;
  onAutoRotate: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  onHelp: () => void;
}

/** Floating navigation bar at the bottom of the screen. */
export function Toolbar(p: Props) {
  return (
    <nav className="toolbar glass" aria-label="Navigation">
      <Tool label="Back" keys="[" onClick={p.onBack} disabled={!p.canBack}>
        <BackIcon />
      </Tool>
      <Tool label="Forward" keys="]" onClick={p.onForward} disabled={!p.canForward}>
        <ForwardIcon />
      </Tool>
      <span className="tool-sep" />
      <Tool label="Fit view" keys="F" onClick={p.onFit}>
        <FitIcon />
      </Tool>
      <Tool label="Zoom out" keys="−" onClick={() => p.onZoom(1.5)}>
        <MinusIcon />
      </Tool>
      <Tool label="Zoom in" keys="+" onClick={() => p.onZoom(1 / 1.5)}>
        <PlusIcon />
      </Tool>
      <Tool label="Auto-rotate" keys="R" onClick={p.onAutoRotate} active={p.autoRotate}>
        <RotateIcon />
      </Tool>
      <span className="tool-sep" />
      <Tool label="Display settings" onClick={p.onSettings} active={p.settingsOpen}>
        <SlidersIcon />
      </Tool>
      <Tool label="Help & shortcuts" keys="?" onClick={p.onHelp}>
        <HelpIcon />
      </Tool>
    </nav>
  );
}
