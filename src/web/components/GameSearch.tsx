import { useState, useRef } from "react";
import { CompletionType, COMPLETION_LABELS, formatHours, nextGameColor, ScheduledGame } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

interface GameResult {
  id: string; title: string; imageUrl: string | null;
  platforms: string[]; developer: string | null;
  genres?: string[]; publisher?: string | null;
  main: number | null; main_sides: number | null;
  completionist: number | null; average: number | null; url?: string;
}

interface Props {
  onAdd: (game: Omit<ScheduledGame, "id">) => void;
  existingColors: string[];
  nextPriority: number;
}

type ImportMode = "search" | "url";

export function GameSearch({ onAdd, existingColors, nextPriority }: Props) {
  const { theme: t } = useTheme();
  const [mode, setMode] = useState<ImportMode>("search");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GameResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GameResult | null>(null);
  const [completionType, setCompletionType] = useState<CompletionType>("main");
  const [customHours, setCustomHours] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);

  const runSearch = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true); setError(null);
    try {
      const res = await fetch("/api/hltb/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const data = await res.json<{ games?: GameResult[]; error?: string }>();
      if (data.error) throw new Error(data.error);
      setSearchResults(data.games ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setSearching(false); }
  };

  const handleSearchInput = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 500);
  };

  const handleFetchUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setFetching(true); setError(null); setSelected(null);
    try {
      const res = await fetch("/api/hltb/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: trimmed }) });
      const data = await res.json<{ game?: GameResult; error?: string }>();
      if (data.error) throw new Error(data.error);
      if (!data.game) throw new Error("No game data returned");
      pickGame(data.game);
    } catch (e: any) { setError(e.message); }
    finally { setFetching(false); }
  };

  const pickGame = (g: GameResult) => {
    setSelected(g); setSearchResults([]); setProgressPercent(0); setCustomHours("");
    const order: CompletionType[] = ["main", "main_sides", "completionist", "average"];
    let found = false;
    for (const ct of order) {
      if (g[ct === "main_sides" ? "main_sides" : ct as keyof GameResult] !== null) {
        setCompletionType(ct); found = true; break;
      }
    }
    if (!found) setCompletionType("custom");
  };

  const handleAdd = () => {
    if (!selected) return;
    if (completionType === "custom" && (!customHours || isNaN(parseFloat(customHours)) || parseFloat(customHours) <= 0)) {
      setError("Enter a valid number of hours for custom completion."); return;
    }
    onAdd({
      hltbId: selected.id, title: selected.title, imageUrl: selected.imageUrl,
      hltb: { main: selected.main, main_sides: selected.main_sides, completionist: selected.completionist, average: selected.average, imageUrl: selected.imageUrl, platforms: selected.platforms, developer: selected.developer, genres: selected.genres, url: selected.url },
      completionType,
      customHours: completionType === "custom" ? parseFloat(customHours) : null,
      progressPercent, startDate,
      color: nextGameColor(existingColors),
      platforms: selected.platforms, priority: nextPriority, minHoursPerDay: 0, maxHoursPerDay: 0,
      completionOverride: null,
      archived: false,
      archivedDays: [],
      archivedHoursPlayed: 0,
    });
    setQuery(""); setUrl(""); setSearchResults([]); setSelected(null); setError(null);
    setCompletionType("main"); setCustomHours(""); setProgressPercent(0);
  };

  const clearSelected = () => { setSelected(null); setUrl(""); setQuery(""); setSearchResults([]); };

  const hasAnyHltb = selected
    ? (selected.main !== null || selected.main_sides !== null || selected.completionist !== null || selected.average !== null)
    : false;

  const inputBase = {
    background: t.bgElevated, border: `1px solid ${t.border}`,
    color: t.textPrimary, fontFamily: "DM Mono, monospace", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Mode tabs */}
      <div style={{ display: "flex", border: `1px solid ${t.border}`, overflow: "hidden" }}>
        {(["search", "url"] as ImportMode[]).map((m, i) => (
          <button key={m}
            onClick={() => { setMode(m); setError(null); setSelected(null); setSearchResults([]); }}
            style={{
              flex: 1, padding: "7px 0",
              background: mode === m ? t.accentBg : "transparent",
              border: "none", borderRight: m === "search" ? `1px solid ${t.border}` : "none",
              color: mode === m ? t.accentText : t.textSecondary,
              cursor: "pointer", fontSize: 15,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s",
            }}
          >{m === "search" ? "🔍 Search" : "🔗 URL"}</button>
        ))}
      </div>

      {/* Search mode */}
      {mode === "search" && !selected && (
        <>
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>Search by game name. Results from HowLongToBeat.</div>
          <div style={{ position: "relative" }}>
            <input
              value={query} onChange={e => handleSearchInput(e.target.value)}
              placeholder="e.g. Elden Ring, Hades..." autoFocus
              style={{ ...inputBase, width: "100%", padding: "8px 10px", fontSize: 16, clipPath: "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%)" }}
              onFocus={e => (e.target.style.borderColor = t.accent)}
              onBlur={e => (e.target.style.borderColor = t.border)}
            />
            {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.accentText, fontSize: 10 }}>searching...</span>}
          </div>

          {error && <ErrorBox msg={error} sub="Try the URL import tab instead." />}

          {searchResults.length > 0 && (
            <div style={{ border: `1px solid ${t.border}`, background: t.bgSurface, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
              {searchResults.map(r => (
                <button key={r.id} onClick={() => pickGame(r)}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", background: "transparent", border: "none", borderBottom: `1px solid ${t.borderSubtle}`, cursor: "pointer", textAlign: "left", color: t.textPrimary }}
                  onMouseEnter={e => (e.currentTarget.style.background = t.bgElevated)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {r.imageUrl
                    ? <img src={r.imageUrl} alt="" style={{ width: 70, height: 90, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.borderSubtle}` }} />
                    : <div style={{ width: 70, height: 90, background: t.bgElevated, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: t.textMuted }}>?</div>
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>{r.title}</div>
                    <div style={{ color: t.textSecondary, fontSize: 12, display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                      {r.main !== null && <span style={{ color: t.accentText }}>Main: {formatHours(r.main)}</span>}
                      {r.completionist !== null && <span>100%: {formatHours(r.completionist)}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!searching && query.trim().length >= 2 && searchResults.length === 0 && !error && (
            <div style={{ color: t.textMuted, fontSize: 12, textAlign: "center", padding: "12px 0" }}>No results found</div>
          )}
        </>
      )}

      {/* URL mode */}
      {mode === "url" && !selected && (
        <>
          <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.7, padding: "6px 8px", background: t.bgInput, border: `1px solid ${t.borderSubtle}` }}>
            Paste a game page URL from{" "}
            <a href="https://howlongtobeat.com" target="_blank" rel="noreferrer" style={{ color: t.accentText, textDecoration: "none" }}>howlongtobeat.com</a>
            <br /><span style={{ color: t.textMuted }}>e.g. https://howlongtobeat.com/game/68151</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={url} onChange={e => { setUrl(e.target.value); setError(null); }} onKeyDown={e => e.key === "Enter" && handleFetchUrl()}
              placeholder="https://howlongtobeat.com/game/..."
              style={{ ...inputBase, flex: 1, padding: "7px 10px", fontSize: 16, clipPath: "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%)", minWidth: 0 }}
              onFocus={e => (e.target.style.borderColor = t.accent)}
              onBlur={e => (e.target.style.borderColor = t.border)}
            />
            <button onClick={handleFetchUrl} disabled={fetching || !url.trim()}
              style={{
                padding: "7px 12px", background: fetching ? t.bgElevated : t.accentBg,
                border: `1px solid ${fetching ? t.border : t.accent}`,
                color: fetching ? t.textSecondary : t.accentText,
                cursor: fetching ? "not-allowed" : "pointer",
                fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, flexShrink: 0,
                clipPath: "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%)",
              }}
            >{fetching ? "..." : "FETCH"}</button>
          </div>
          {error && <ErrorBox msg={error} />}
        </>
      )}

      {/* Selected game */}
      {selected && (
        <div style={{
          border: `1px solid ${t.border}`, background: t.bgElevated, padding: 12,
          display: "flex", flexDirection: "column", gap: 10,
          clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)",
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {selected.imageUrl
              ? <img src={selected.imageUrl} alt="" style={{ width: 66, height: 87, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.border}` }} />
              : <div style={{ width: 66, height: 87, background: t.bgSurface, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎮</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 700, lineHeight: 1.2, marginBottom: 3, color: t.textPrimary }}>{selected.title}</div>
              {selected.platforms.length > 0 && <div style={{ fontSize: 12, color: t.textSecondary }}>{selected.platforms.slice(0, 6).join(" · ")}</div>}
              {selected.developer && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>{selected.developer}</div>}
            </div>
            <button onClick={clearSelected} style={{ background: "none", border: "none", color: t.textSecondary, cursor: "pointer", fontSize: 15, padding: 2, flexShrink: 0 }}>✕</button>
          </div>

          {/* Completion type */}
          <div>
            <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Completion Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {(["main", "main_sides", "completionist", "average"] as CompletionType[]).map(ct => {
                const h = selected[ct === "main_sides" ? "main_sides" : ct as keyof GameResult] as number | null;
                const active = completionType === ct;
                return (
                  <button key={ct} onClick={() => h !== null && setCompletionType(ct)} disabled={h === null}
                    style={{
                      padding: "6px 8px",
                      background: active ? t.accentBg : "transparent",
                      border: `1px solid ${active ? t.accent : t.border}`,
                      color: h === null ? t.textDisabled : active ? t.accentText : t.textPrimary,
                      cursor: h === null ? "not-allowed" : "pointer",
                      fontSize: 12, fontFamily: "DM Mono, monospace", textAlign: "left",
                      clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)",
                      boxShadow: active && t.accentGlow !== "none" ? t.accentGlow : "none",
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{COMPLETION_LABELS[ct]}</div>
                    <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 700 }}>{formatHours(h)}</div>
                  </button>
                );
              })}
              <button onClick={() => setCompletionType("custom")}
                style={{
                  padding: "6px 8px",
                  background: completionType === "custom" ? t.accentBg : "transparent",
                  border: `1px solid ${completionType === "custom" ? t.accent : t.border}`,
                  color: completionType === "custom" ? t.accentText : t.textSecondary,
                  cursor: "pointer", fontSize: 12, fontFamily: "DM Mono, monospace", textAlign: "left",
                  clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)",
                  gridColumn: hasAnyHltb ? "auto" : "1 / -1",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7 }}>Custom</div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 700 }}>{customHours ? `${customHours}h` : "—"}</div>
              </button>
            </div>

            {completionType === "custom" && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Custom Hours</div>
                <input type="number" min={0.5} step={0.5} value={customHours} onChange={e => setCustomHours(e.target.value)} placeholder="e.g. 40"
                  style={{ width: "100%", ...inputBase, background: t.bgInput, padding: "6px 10px", fontSize: 12, colorScheme: t.mode as any }}
                  onFocus={e => (e.target.style.borderColor = t.accent)}
                  onBlur={e => (e.target.style.borderColor = t.border)}
                />
              </div>
            )}
          </div>

          {/* Progress */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Already Completed</div>
              <span style={{ fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, color: progressPercent > 0 ? t.accentText : t.textDisabled }}>{progressPercent}%</span>
            </div>
            <input type="range" min={0} max={99} value={progressPercent} onChange={e => setProgressPercent(parseInt(e.target.value))}
              style={{ width: "100%", accentColor: t.accent, cursor: "pointer" }}
            />
            {progressPercent > 0 && (
              <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 4 }}>
                Schedules only the remaining <span style={{ color: t.accentText }}>{100 - progressPercent}%</span> of playtime
              </div>
            )}
          </div>

          {/* Start date */}
          <div>
            <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Start Date</div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ width: "100%", ...inputBase, background: t.bgInput, padding: "6px 10px", fontSize: 12, colorScheme: t.mode as any }}
            />
          </div>

          <div style={{ fontSize: 12, color: t.textSecondary, padding: "4px 8px", background: t.bgInput, border: `1px solid ${t.borderSubtle}` }}>
            Priority: <span style={{ color: t.textPrimary }}>#{nextPriority}</span> — drag to reorder after adding
          </div>

          {error && <ErrorBox msg={error} />}

          <button onClick={handleAdd}
            style={{
              padding: "9px 16px", background: t.accentBg,
              border: `1px solid ${t.accent}`, color: t.accentText,
              cursor: "pointer", fontSize: 12,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
              boxShadow: t.accentGlow !== "none" ? t.accentGlow : "none",
            }}
          >+ Add to Calendar</button>
        </div>
      )}
    </div>
  );
}

function ErrorBox({ msg, sub }: { msg: string; sub?: string }) {
  const { theme: t } = useTheme();
  return (
    <div style={{ color: t.danger, fontSize: 12, padding: "6px 8px", background: `${t.danger}12`, border: `1px solid ${t.danger}30`, lineHeight: 1.5 }}>
      {msg}
      {sub && <div style={{ marginTop: 4, color: t.textSecondary }}>{sub}</div>}
    </div>
  );
}
