import { useEffect, useState } from "react";
import { loadLyrics } from "../data/loadGraph";
import { topicCss } from "../lib/colors";
import type { GraphData } from "../types";
import { ChevronIcon, CloseIcon, ExternalIcon, FilterIcon, GraphIcon, TargetIcon } from "./icons";
import { Segmented } from "./Segmented";

interface Props {
  data: GraphData;
  song: number;
  focusMode: boolean;
  hops: 1 | 2;
  onToggleFocus: () => void;
  onHops: (h: 1 | 2) => void;
  isArtistSelected: boolean;
  onClose: () => void;
  onSelect: (song: number) => void;
  onFly: () => void;
  onAddArtist: (artist: number) => void;
  onTopicClick: (topic: number) => void;
  colorOf: (artist: number) => string;
}

export function SongPanel(p: Props) {
  const { data, song, colorOf } = p;
  const artist = data.songArtist[song];
  const info = data.meta.artists[artist];
  const topic = data.cluster[song];
  const [lyrics, setLyrics] = useState<{ song: number; text: string; link: string } | null>(null);
  const [error, setError] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    loadLyrics(artist)
      .then((rows) => {
        if (!alive) return;
        const [text, link] = rows[song - info.start];
        setLyrics({ song, text, link });
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [artist, song, info.start]);

  const neighbours = Array.from({ length: data.k }, (_, r) => ({
    song: data.knnIdx[song * data.k + r],
    sim: data.knnSim[song * data.k + r],
  }));
  const [lo] = data.simRange;
  const current = lyrics?.song === song ? lyrics : null;

  return (
    <aside className="song-panel glass" style={{ ["--accent" as string]: topicCss(topic) }}>
      <div className="song-accent" />
      <header className="song-header">
        <div className="song-heading">
          <h2>{data.meta.titles[song]}</h2>
          <div className="song-meta">
            <button
              className="meta-chip"
              onClick={() => p.onAddArtist(artist)}
              disabled={p.isArtistSelected}
              title={p.isArtistSelected ? "Artist is in the filter" : `Filter the map to ${info.name}`}
            >
              <span className="dot" style={{ background: colorOf(artist) }} />
              {info.name}
              {!p.isArtistSelected && <FilterIcon size={13} />}
            </button>
            <button className="meta-chip" onClick={() => p.onTopicClick(topic)} title="Fly to this topic">
              <span className="dot" style={{ background: topicCss(topic) }} />
              {data.meta.topics[topic].words.slice(0, 3).join(" · ")}
            </button>
          </div>
        </div>
        <button className="icon-btn ghost" onClick={p.onClose} aria-label="Close (Esc)" title="Close (Esc)">
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="song-body">
        <div className={`focus-card ${p.focusMode ? "on" : ""}`}>
          <button className="focus-toggle" onClick={p.onToggleFocus} aria-pressed={p.focusMode}>
            <GraphIcon size={20} />
            <span>
              <strong>{p.focusMode ? "Showing connections only" : "Show connections only"}</strong>
              <small>
                {p.focusMode
                  ? "Other songs are hidden. Click a node to walk the graph."
                  : "Hide every other song and lay out this song's neighbours as a graph."}
              </small>
            </span>
            <span className={`switch ${p.focusMode ? "on" : ""}`} aria-hidden="true" />
          </button>
          {p.focusMode && (
            <Segmented
              size="sm"
              value={p.hops}
              onChange={p.onHops}
              options={[
                { value: 1, label: "Direct neighbours" },
                { value: 2, label: "+ their neighbours" },
              ]}
            />
          )}
        </div>

        <div className="song-actions">
          <button className="btn" onClick={p.onFly}>
            <TargetIcon size={16} /> Fly to song
          </button>
          {current && (
            <a className="btn" href={current.link} target="_blank" rel="noreferrer">
              <ExternalIcon size={15} /> Source
            </a>
          )}
        </div>

        <section>
          <div className="section-label">Most similar lyrics</div>
          <ol className="neighbours">
            {neighbours.map((n, i) => (
              <li key={n.song}>
                <button onClick={() => p.onSelect(n.song)}>
                  <span className="n-rank">{i + 1}</span>
                  <span className="n-main">
                    <span className="n-title">{data.meta.titles[n.song]}</span>
                    <span className="n-artist">
                      <span className="dot sm" style={{ background: topicCss(data.cluster[n.song]) }} />
                      {data.meta.artists[data.songArtist[n.song]].name}
                    </span>
                  </span>
                  <span className="n-sim" title="Cosine similarity of the CLIP lyric embeddings">
                    <span className="n-bar">
                      <span style={{ width: `${Math.max(4, ((n.sim - lo) / (1 - lo)) * 100)}%` }} />
                    </span>
                    {n.sim.toFixed(3)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <button className="section-toggle" onClick={() => setShowLyrics(!showLyrics)} aria-expanded={showLyrics}>
            <span className="section-label">Lyrics</span>
            <ChevronIcon size={16} className={showLyrics ? "flip" : ""} />
          </button>
          {showLyrics && (
            <>
              {error && <p className="hint">Could not load lyrics.</p>}
              {!error && !current && <p className="hint">Loading…</p>}
              {current && current.text && <pre className="lyrics">{current.text}</pre>}
              {current && !current.text && (
                <p className="hint">
                  Lyrics aren't included in this public version. Use <strong>Source</strong> above to read them on
                  the original site.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
