import { useMemo, useState, type RefObject } from "react";
import { topicCss } from "../lib/colors";
import type { FilterMode, GraphData, LayoutMode, ShownLayout } from "../types";
import { CloseIcon, LogoIcon, SearchIcon, SidebarIcon } from "./icons";
import { Segmented } from "./Segmented";

export interface SidebarProps {
  data: GraphData;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedArtists: number[];
  onAddArtist: (a: number) => void;
  onRemoveArtist: (a: number) => void;
  onClearArtists: () => void;
  onPickSong: (s: number) => void;
  onTopicClick: (t: number) => void;
  hoverTopic: number | null;
  onTopicHover: (t: number | null) => void;
  filterMode: FilterMode;
  setFilterMode: (m: FilterMode) => void;
  layout: LayoutMode;
  shownLayout: ShownLayout;
  setLayout: (m: LayoutMode) => void;
  visibleCount: number;
  colorOf: (artist: number) => string;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

function topicName(data: GraphData, t: number) {
  return data.meta.topics[t].words.slice(0, 3).join(" · ");
}

function useSearch(data: GraphData, query: string) {
  const artistsLower = useMemo(() => data.meta.artists.map((a) => a.name.toLowerCase()), [data]);
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const empty = { artists: [] as number[], songs: [] as number[], topics: [] as number[] };
    if (!q) return empty;
    const rank = (s: string) => (s.startsWith(q) ? 0 : s.includes(" " + q) ? 1 : s.includes(q) ? 2 : -1);
    const artists = artistsLower
      .map((s, i) => ({ i, r: rank(s) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || data.meta.artists[b.i].count - data.meta.artists[a.i].count)
      .slice(0, 5)
      .map((x) => x.i);
    const topics = data.meta.topics
      .map((t, i) => ({ i, hit: t.words.some((w) => w.startsWith(q)) }))
      .filter((x) => x.hit)
      .slice(0, 3)
      .map((x) => x.i);
    const songs: { i: number; r: number }[] = [];
    if (q.length >= 2) {
      for (let i = 0; i < data.titlesLower.length; i++) {
        const r = rank(data.titlesLower[i]);
        if (r >= 0) songs.push({ i, r });
      }
      songs.sort((a, b) => a.r - b.r || data.titlesLower[a.i].length - data.titlesLower[b.i].length);
    }
    return { artists, topics, songs: songs.slice(0, 7).map((x) => x.i) };
  }, [data, artistsLower, query]);
}

export function Sidebar(p: SidebarProps) {
  const { data, colorOf } = p;
  const { open, setOpen } = p;
  const [query, setQuery] = useState("");
  const results = useSearch(data, query);
  const hasSel = p.selectedArtists.length > 0;
  const focus = p.shownLayout === "focus";
  const topicsBySize = useMemo(
    () => data.meta.topics.map((t, i) => ({ i, count: t.count })).sort((a, b) => b.count - a.count),
    [data],
  );
  const anyResults = results.artists.length + results.songs.length + results.topics.length > 0;

  const pick = (fn: () => void) => {
    fn();
    setQuery("");
    p.searchRef.current?.blur();
  };

  if (!open) {
    return (
      <button className="sidebar-open glass" onClick={() => setOpen(true)} aria-label="Open sidebar">
        <SidebarIcon />
      </button>
    );
  }

  return (
    <aside className="sidebar glass">
      <header className="brand">
        <div className="brand-mark">
          <LogoIcon size={20} />
        </div>
        <div className="brand-text">
          <h1>Song Graph</h1>
          <p>
            {data.count.toLocaleString()} songs · {data.meta.artists.length} artists
          </p>
        </div>
        <button className="icon-btn ghost" onClick={() => setOpen(false)} aria-label="Hide sidebar" title="Hide sidebar">
          <SidebarIcon />
        </button>
      </header>

      <div className="search">
        <SearchIcon className="search-icon" />
        <input
          ref={p.searchRef}
          type="text"
          placeholder="Search artists, songs, topics"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (results.artists.length) pick(() => p.onAddArtist(results.artists[0]));
              else if (results.songs.length) pick(() => p.onPickSong(results.songs[0]));
              else if (results.topics.length) pick(() => p.onTopicClick(results.topics[0]));
            }
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
            }
          }}
        />
        {query ? (
          <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
            <CloseIcon size={14} />
          </button>
        ) : (
          <kbd className="search-kbd">/</kbd>
        )}
        {query.trim() && (
          <div className="search-results glass">
            {!anyResults && <div className="results-empty">No matches</div>}
            {results.artists.length > 0 && <div className="results-heading">Artists · filter the map</div>}
            {results.artists.map((a) => (
              <button
                key={`a${a}`}
                className="result"
                onClick={() => pick(() => p.onAddArtist(a))}
                disabled={p.selectedArtists.includes(a)}
              >
                <span className="dot" style={{ background: colorOf(a) }} />
                <span className="result-main">{data.meta.artists[a].name}</span>
                <span className="result-meta">{data.meta.artists[a].count} songs</span>
              </button>
            ))}
            {results.topics.length > 0 && <div className="results-heading">Topics · fly there</div>}
            {results.topics.map((t) => (
              <button key={`t${t}`} className="result" onClick={() => pick(() => p.onTopicClick(t))}>
                <span className="dot" style={{ background: topicCss(t) }} />
                <span className="result-main">{topicName(data, t)}</span>
                <span className="result-meta">{compact(data.meta.topics[t].count)}</span>
              </button>
            ))}
            {results.songs.length > 0 && <div className="results-heading">Songs · open</div>}
            {results.songs.map((s) => (
              <button key={`s${s}`} className="result" onClick={() => pick(() => p.onPickSong(s))}>
                <span className="dot" style={{ background: topicCss(data.cluster[s]) }} />
                <span className="result-main">{data.meta.titles[s]}</span>
                <span className="result-meta">{data.meta.artists[data.songArtist[s]].name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasSel && (
        <section className="filter-box">
          <div className="chips">
            {p.selectedArtists.map((a) => (
              <span key={a} className="chip" style={{ borderColor: colorOf(a) }}>
                <span className="dot" style={{ background: colorOf(a) }} />
                {data.meta.artists[a].name}
                <button onClick={() => p.onRemoveArtist(a)} aria-label={`Remove ${data.meta.artists[a].name}`}>
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
            <button className="link-btn" onClick={p.onClearArtists}>
              Clear
            </button>
          </div>
          <Segmented
            value={p.layout}
            onChange={p.setLayout}
            options={[
              { value: "global", label: "On the map", title: "Show their songs on the shared map" },
              { value: "artist", label: "Own maps", title: "A separate UMAP of each artist's songs" },
            ]}
          />
          {p.layout === "global" && (
            <Segmented
              value={p.filterMode}
              onChange={p.setFilterMode}
              options={[
                { value: "highlight", label: "Dim others" },
                { value: "isolate", label: "Hide others" },
              ]}
            />
          )}
        </section>
      )}

      <section className={`topics ${focus || p.shownLayout === "artist" ? "inactive" : ""}`}>
        <div className="section-label">
          Topics
          <span className="section-hint">{focus ? "exit focus to browse" : "click to fly · hover to highlight"}</span>
        </div>
        <ul className="topic-list" onMouseLeave={() => p.onTopicHover(null)}>
          {topicsBySize.map(({ i, count }) => (
            <li key={i}>
              <button
                className={`topic-row ${p.hoverTopic === i ? "active" : ""}`}
                onClick={() => p.onTopicClick(i)}
                onMouseEnter={() => p.onTopicHover(i)}
                disabled={focus}
              >
                <span className="topic-swatch" style={{ background: topicCss(i), color: topicCss(i) }} />
                <span className="topic-name">{topicName(data, i)}</span>
                <span className="topic-count">{compact(count)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="sidebar-footer">
        Showing {p.visibleCount.toLocaleString()} of {data.count.toLocaleString()} songs
      </footer>
    </aside>
  );
}
