import { CloseIcon } from "./icons";

const MOUSE = [
  ["Drag", "Orbit around the centre"],
  ["Right-drag", "Pan"],
  ["Scroll", "Zoom toward the cursor"],
  ["Click a song", "Open it and centre the view on it"],
  ["Double-click a song", "Fly in close"],
  ["Click a topic label", "Fly to that topic island"],
];

const KEYS = [
  ["/", "Search"],
  ["G", "Show connections only (for the open song)"],
  ["1 / 2", "Direct neighbours / + their neighbours"],
  ["[  ]", "Back / forward through songs you opened"],
  ["F", "Fit view"],
  ["+  −", "Zoom in / out"],
  ["R", "Auto-rotate"],
  ["Esc", "Leave connections view, then close the song"],
  ["?", "This help"],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal glass" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>How to explore</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </header>
        <p className="modal-intro">
          Every dot is a song. Songs with similar lyrics sit close together, and the coloured islands are lyric
          topics. Click a song to see its closest matches, then turn on <strong>Show connections only</strong> to
          hide everything else and walk from song to song.
        </p>
        <div className="help-grid">
          <div>
            <div className="section-label">Mouse</div>
            <dl>
              {MOUSE.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <div className="section-label">Keyboard</div>
            <dl>
              {KEYS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
