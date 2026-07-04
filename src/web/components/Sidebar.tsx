import { useState } from "react";
import { ScheduledGame, AppState, getGameHours, getTotalHours, formatHours, formatWeeksDays, COMPLETION_LABELS, computeGameDays, formatDate, todayLocal } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";
import { GameSearch } from "./GameSearch";
import { ColorPicker } from "./ColorPicker";

interface Props {
  state: AppState;
  onAdd: (game: Omit<ScheduledGame, "id">) => void;
  onRemove: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onUpdateGame: (id: string, patch: Partial<ScheduledGame>) => void;
  onReorderGames: (games: ScheduledGame[]) => void;
}

export function Sidebar({ state, onAdd, onRemove, onArchive, onUnarchive, onUpdateGame, onReorderGames }: Props) {
  const { theme: t } = useTheme();
  const [tab, setTab] = useState<"games" | "archive" | "add">("games");

  const activeGames = state.games.filter(g => !g.archived);
  const archivedGames = state.games.filter(g => g.archived);
  const existingColors = state.games.map(g => g.color);
  const nextPriority = activeGames.length + 1;
  const sortedGames = [...activeGames].sort((a, b) => a.priority - b.priority);
  const sortedArchived = [...archivedGames].sort((a, b) => {
    const aEnd = a.archivedDays[a.archivedDays.length - 1]?.date ?? "";
    const bEnd = b.archivedDays[b.archivedDays.length - 1]?.date ?? "";
    return bEnd.localeCompare(aEnd);
  });

  const handleDrop = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    const sorted = [...activeGames].sort((a, b) => a.priority - b.priority);
    const dragIdx = sorted.findIndex(g => g.id === dragId);
    const targetIdx = sorted.findIndex(g => g.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const renumbered = reordered.map((g, i) => ({ ...g, priority: i + 1 }));
    onReorderGames([...renumbered, ...archivedGames]);
  };

  return (
    <div style={{
      width: 400, flexShrink: 0,
      background: t.bgBase,
      borderRight: `1px solid ${t.border}`,
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "0.06em", color: t.accentText, textShadow: t.accentGlow !== "none" ? `0 0 20px ${t.accent}50` : "none", lineHeight: 1 }}>
          HOWLONGTOBEAT
        </div>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "0.06em", color: t.accentText, textShadow: t.accentGlow !== "none" ? `0 0 20px ${t.accent}50` : "none", lineHeight: 1 }}>
          <span style={{ color: t.textPrimary }}>CALENDAR</span>
        </div>
        <div style={{ color: t.textMuted, fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>
          Completion Tracker
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", margin: "12px 16px 0", borderBottom: `1px solid ${t.border}` }}>
        {(["games", "archive", "add"] as const).map(tab_ => (
          <button
            key={tab_}
            onClick={() => setTab(tab_)}
            style={{
              flex: 1, padding: "8px 0",
              background: "transparent", border: "none",
              borderBottom: tab === tab_ ? `2px solid ${t.accent}` : "2px solid transparent",
              color: tab === tab_ ? t.accentText : t.textSecondary,
              cursor: "pointer", fontSize: 15,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase", transition: "all 0.15s",
            }}
          >
            {tab_ === "games"
              ? `Library (${activeGames.length})`
              : tab_ === "archive"
              ? `Archive (${archivedGames.length})`
              : "+ Add"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {tab === "add" ? (
          <GameSearch onAdd={(g) => { onAdd(g); setTab("games"); }} existingColors={existingColors} nextPriority={nextPriority} />
        ) : tab === "archive" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sortedArchived.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "32px 16px", lineHeight: 1.7 }}>
                No archived games yet.<br />
                <span style={{ fontSize: 12 }}>Finish a game and click ✓ to archive it.</span>
              </div>
            ) : (
              sortedArchived.map(game => (
                <ArchivedGameCard
                  key={game.id} game={game}
                  onUnarchive={() => onUnarchive(game.id)}
                  onRemove={() => onRemove(game.id)}
                />
              ))
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sortedGames.length > 1 && (
              <div style={{ fontSize: 13, color: t.textMuted, padding: "4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                <span>⠿</span><span>Drag to reorder</span>
              </div>
            )}
            {sortedGames.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: 15, textAlign: "center", padding: "32px 16px", lineHeight: 2 }}>
                No games yet.<br />
                <button onClick={() => setTab("add")} style={{ background: "none", border: "none", color: t.accentText, cursor: "pointer", fontSize: 15, fontFamily: "DM Mono, monospace" }}>
                  + Add your first game
                </button>
              </div>
            ) : (
              sortedGames.map((game, idx) => (
                <DraggableGameCard
                  key={game.id} game={game} state={state}
                  isHighestPriority={idx === 0}
                  onRemove={() => onRemove(game.id)}
                  onArchive={() => onArchive(game.id)}
                  onUpdate={(patch) => onUpdateGame(game.id, patch)}
                  onDrop={handleDrop}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ArchivedGameCard({ game, onUnarchive, onRemove }: {
  game: ScheduledGame; onUnarchive: () => void; onRemove: () => void;
}) {
  const { theme: t } = useTheme();
  const totalHoursPlayed = game.archivedHoursPlayed;
  const startDate = game.archivedDays[0]?.date ?? game.startDate;
  const endDate = game.archivedDays[game.archivedDays.length - 1]?.date ?? game.startDate;

  return (
    <div style={{
      background: t.bgSurface,
      border: `1px solid ${t.border}`,
      clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
      overflow: "hidden",
      opacity: 0.85,
    }}>
      <div style={{ display: "flex", height: 2 }}>
        <div style={{ width: 28, background: t.border, flexShrink: 0 }} />
        <div style={{ flex: 1, background: `${game.color}80` }} />
      </div>

      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{
            width: 28, flexShrink: 0, paddingTop: 2,
            fontSize: 14, color: t.success, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
            letterSpacing: "0.05em", textAlign: "center",
          }}>
            ✓
          </div>

          {game.imageUrl
            ? <img src={game.imageUrl} alt="" style={{ width: 60, height: 78, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.borderSubtle}`, filter: "grayscale(30%)" }} />
            : <div style={{ width: 34, height: 44, background: t.bgElevated, flexShrink: 0 }} />
          }

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 700, lineHeight: 1.2, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.textPrimary }}>
              {game.title}
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: game.color, background: `${game.color}18`, padding: "1px 6px" }}>
                {formatHours(totalHoursPlayed)} played
              </span>
              <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Archived
              </span>
            </div>
            <div style={{ marginTop: 4, display: "flex", gap: 6, fontSize: 11, color: t.textMuted }}>
              <span>{formatDate(startDate)}</span>
              <span>→</span>
              <span style={{ color: game.color }}>{formatDate(endDate)}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <button
              onClick={onUnarchive}
              title="Move back to active library"
              style={{
                background: "transparent", border: `1px solid ${t.border}`,
                color: t.textSecondary, cursor: "pointer", padding: "2px 8px",
                fontSize: 10, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >
              Unarchive
            </button>
            <button
              onClick={onRemove}
              title="Delete permanently"
              aria-label="Delete permanently"
              style={{
                background: "none", border: "none",
                color: t.danger, cursor: "pointer", fontSize: 14, padding: "2px 4px",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraggableGameCard({ game, state, isHighestPriority, onRemove, onArchive, onUpdate, onDrop }: {
  game: ScheduledGame; state: AppState; isHighestPriority: boolean;
  onRemove: () => void; onArchive: () => void; onUpdate: (patch: Partial<ScheduledGame>) => void;
  onDrop: (dragId: string, targetId: string) => void;
}) {
  const { theme: t } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isDraggable, setIsDraggable] = useState(false);

  const remainingHours = getGameHours(game);
  const totalHours = getTotalHours(game);
  const days = computeGameDays(game, state.schedule, state.games, state.dayOverrides, state.gameDayOverrides);
  const endDate = days.length > 0 ? days[days.length - 1].date : game.startDate;
  const effectiveEnd = game.completionOverride || endDate;
  const startD = new Date(game.startDate + "T00:00:00");
  const endD = new Date(effectiveEnd + "T00:00:00");
  const totalDays = Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1;
  const progressPercent = game.progressPercent ?? 0;
  const today = todayLocal();
  const playedHours = days.filter(d => d.date <= today).reduce((s, d) => s + d.hours, 0);
  // Hours still scheduled after today — the live time remaining, shrinking as days are played.
  const liveRemainingHours = days.filter(d => d.date > today).reduce((s, d) => s + d.hours, 0);
  // Days the game is actually on the calendar (played + scheduled), not the raw start→end span.
  const scheduledDays = days.filter(d => d.hours > 0).length;
  const totalPercentDone = totalHours > 0
    ? Math.min(100, Math.round(progressPercent + (playedHours / totalHours) * 100))
    : progressPercent;

  return (
    <div
      draggable={isDraggable}
      onDragStart={e => { if (!isDraggable) { e.preventDefault(); return; } e.dataTransfer.setData("gameId", game.id); setDragging(true); }}
      onDragEnd={() => { setDragging(false); setIsDraggable(false); }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(e.dataTransfer.getData("gameId"), game.id); }}
      style={{
        background: dragOver ? t.bgElevated : t.bgSurface,
        border: `1px solid ${dragOver ? t.accent : t.border}`,
        clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
        overflow: expanded ? "visible" : "hidden",
        opacity: dragging ? 0.4 : 1,
        cursor: "default",
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      {/* Color strip */}
      <div style={{ display: "flex", height: 2 }}>
        <div style={{ width: 28, background: isHighestPriority ? t.accent : t.border, flexShrink: 0 }} />
        <div style={{ flex: 1, background: game.color, boxShadow: `0 0 6px ${game.color}60` }} />
      </div>

      <div style={{ padding: "10px 12px" }}>
        {/* Collapsed header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          {/* Drag handle — ONLY this enables drag */}
          <div
            onMouseDown={() => setIsDraggable(true)}
            onMouseUp={() => setIsDraggable(false)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, paddingTop: 2, cursor: "grab" }}
          >
            <span style={{ color: t.textMuted, fontSize: 18, lineHeight: 1, userSelect: "none" }}>⠿</span>
          </div>

          {game.imageUrl
            ? <img src={game.imageUrl} alt="" style={{ width: 85, height: 110, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.borderSubtle}` }} />
            : <div style={{ width: 34, height: 44, background: t.bgElevated, flexShrink: 0 }} />
          }

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.textPrimary }}>
              {game.title}
            </div>
            {/* Total hours · weeks and days */}
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: game.color, background: `${game.color}18`, padding: "1px 6px" }}>
                {formatHours(totalHours)}
              </span>
              <span style={{ fontSize: 13, color: t.textSecondary }}>{formatWeeksDays(totalDays)}</span>
            </div>
            {/* % done · % played */}
            <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: t.textSecondary, background: `${t.bgElevated}`, padding: "1px 5px" }}>
                {progressPercent}% done
              </span>
              <span
                title="Estimated total progress: starting % plus scheduled hours played through today"
                style={{ fontSize: 12, color: game.color, background: `${game.color}30`, padding: "1px 5px" }}
              >
                {totalPercentDone}% played
              </span>
            </div>
            {/* start → end */}
            <div style={{ marginTop: 4, display: "flex", gap: 8, fontSize: 12, color: t.textMuted }}>
              <span>{formatDate(game.startDate)}</span>
              <span>→</span>
              <span style={{ color: game.color }}>{formatDate(effectiveEnd)}</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
            <button onClick={() => setExpanded(e => !e)} aria-label={expanded ? "Collapse game details" : "Expand game details"} style={{ background: "none", border: "none", color: t.textSecondary, cursor: "pointer", fontSize: 15, padding: "2px 4px" }}>
              {expanded ? "▲" : "▼"}
            </button>
            <button
              onClick={onArchive}
              title="Archive (finished). Removes from active schedule, keeps calendar history."
              aria-label="Archive game"
              style={{ background: "none", border: "none", color: t.success, cursor: "pointer", fontSize: 15, padding: "2px 4px" }}
            >✓</button>
            <button onClick={onRemove} title="Delete permanently" aria-label="Delete permanently" style={{ background: "none", border: "none", color: t.danger, cursor: "pointer", fontSize: 15, padding: "2px 4px" }}>✕</button>
          </div>
        </div>

        {expanded && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Color picker */}
            <div>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Color</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorPicker color={game.color} onChange={c => onUpdate({ color: c })} />
                <div style={{ flex: 1, height: 2, background: `linear-gradient(to right, ${game.color}80, transparent)` }} />
              </div>
            </div>

            {/* Completion type */}
            <div>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Mode</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {(["main", "main_sides", "completionist", "average"] as const).map(ct => {
                  const h = game.hltb[ct];
                  const active = game.completionType === ct;
                  return (
                    <button
                      key={ct}
                      onClick={() => h !== null && onUpdate({ completionType: ct })}
                      disabled={h === null}
                      style={{
                        padding: "5px 7px",
                        background: active ? `${game.color}18` : "transparent",
                        border: `1px solid ${active ? game.color : t.border}`,
                        color: h === null ? t.textDisabled : active ? game.color : t.textSecondary,
                        cursor: h === null ? "not-allowed" : "pointer",
                        fontSize: 10, fontFamily: "DM Mono, monospace", textAlign: "left",
                        clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%)",
                      }}
                    >
                      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 2 }}>{COMPLETION_LABELS[ct]}</div>
                      <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 700 }}>{formatHours(h)}</div>
                    </button>
                  );
                })}
                <button
                  onClick={() => onUpdate({ completionType: "custom" })}
                  style={{
                    padding: "5px 7px",
                    background: game.completionType === "custom" ? `${game.color}18` : "transparent",
                    border: `1px solid ${game.completionType === "custom" ? game.color : t.border}`,
                    color: game.completionType === "custom" ? game.color : t.textSecondary,
                    cursor: "pointer", fontSize: 10, fontFamily: "DM Mono, monospace", textAlign: "left",
                    clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%)",
                  }}
                >
                  <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 2 }}>Custom</div>
                  <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 700 }}>
                    {game.customHours != null ? `${game.customHours}h` : "—"}
                  </div>
                </button>
              </div>

              {game.completionType === "custom" && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ color: t.textSecondary, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Custom Hours</div>
                  <input
                    type="number" min={0.5} step={0.5}
                    value={game.customHours ?? ""}
                    onChange={e => { const v = parseFloat(e.target.value); onUpdate({ customHours: isNaN(v) ? null : v }); }}
                    placeholder="e.g. 40"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: t.bgInput, border: `1px solid ${game.color}40`,
                      color: t.textPrimary, padding: "5px 8px",
                      fontSize: 12, fontFamily: "DM Mono, monospace", outline: "none",
                      colorScheme: t.mode === "dark" ? "dark" : "light",
                    }}
                    onFocus={e => (e.target.style.borderColor = game.color)}
                    onBlur={e => (e.target.style.borderColor = `${game.color}40`)}
                  />
                </div>
              )}
            </div>

            {/* Progress % */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Already Completed</div>
                <span style={{ fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, color: progressPercent > 0 ? game.color : t.textDisabled }}>
                  {progressPercent}%
                </span>
              </div>
              <input
                type="range" min={0} max={99} value={progressPercent}
                onChange={e => onUpdate({ progressPercent: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: game.color, cursor: "pointer" }}
              />
              {progressPercent > 0 && (
                <div style={{ marginTop: 5, fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                  <span style={{ color: game.color }}>{formatHours(totalHours)}</span> total →{" "}
                  <span style={{ color: t.textPrimary }}>{formatHours(remainingHours)}</span> remaining
                </div>
              )}
            </div>

            {/* Start date */}
            <div>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Start Date</div>
              <input
                type="date" value={game.startDate}
                onChange={e => onUpdate({ startDate: e.target.value })}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: t.bgInput, border: `1px solid ${t.border}`,
                  color: t.textPrimary, padding: "5px 8px",
                  fontSize: 13, fontFamily: "DM Mono, monospace", outline: "none",
                  colorScheme: t.mode === "dark" ? "dark" : "light",
                }}
              />
            </div>

            {/* Max hours/day */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Max hrs/day</div>
                <div style={{ fontSize: 12, color: t.textMuted }}>0 = unlimited</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => {
                  const cur = game.maxHoursPerDay ?? 0;
                  const next = Math.max(0, cur - 0.5);
                  onUpdate({ maxHoursPerDay: next < (game.minHoursPerDay ?? 0) && next !== 0 ? game.minHoursPerDay ?? 0 : next });
                }}
                  style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 15, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
                <div style={{ flex: 1, position: "relative", height: 3, background: t.border }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, height: "100%",
                    width: `${Math.min(100, ((game.maxHoursPerDay ?? 0) / 12) * 100)}%`,
                    background: (game.maxHoursPerDay ?? 0) > 0 ? game.color : t.border,
                    transition: "width 0.1s",
                  }} />
                </div>
                <span style={{ width: 42, textAlign: "center", fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, color: (game.maxHoursPerDay ?? 0) > 0 ? game.color : t.textDisabled }}>
                  {(game.maxHoursPerDay ?? 0) > 0 ? `${game.maxHoursPerDay}h` : "∞"}
                </span>
                <button onClick={() => {
                  const cur = game.maxHoursPerDay ?? 0;
                  const next = Math.min(12, cur + 0.5);
                  const floor = game.minHoursPerDay ?? 0;
                  onUpdate({ maxHoursPerDay: next < floor ? floor : next });
                }}
                  style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 15, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
              </div>
              {(game.maxHoursPerDay ?? 0) > 0 && (
                <div style={{ marginTop: 5, fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                  Capped at <span style={{ color: game.color }}>{game.maxHoursPerDay}h</span> per day; overflow rolls to the next day
                </div>
              )}
            </div>

            {/* Completion Override */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Completion Override</div>
                {game.completionOverride && (
                  <button
                    onClick={() => onUpdate({ completionOverride: null })}
                    style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: 12, fontFamily: "DM Mono, monospace", padding: 0, textDecoration: "underline" }}
                  >clear</button>
                )}
              </div>
              <input
                type="date" value={game.completionOverride || ""}
                onChange={e => onUpdate({ completionOverride: e.target.value || null })}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: t.bgInput, border: `1px solid ${game.completionOverride ? game.color + "60" : t.border}`,
                  color: t.textPrimary, padding: "5px 8px",
                  fontSize: 13, fontFamily: "DM Mono, monospace", outline: "none",
                  colorScheme: t.mode === "dark" ? "dark" : "light",
                }}
              />
              {game.completionOverride && (
                <div style={{ marginTop: 5, fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                  Mark complete on <span style={{ color: game.color }}>{formatDate(game.completionOverride)}</span> instead of {formatDate(endDate)}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div style={{ fontSize: 12, color: t.textSecondary, background: t.bgInput, border: `1px solid ${t.borderSubtle}`, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Start</span><span style={{ color: t.textPrimary }}>{formatDate(game.startDate)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Finish</span><span style={{ color: game.color }}>{formatDate(game.completionOverride || endDate)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Calendar days</span>
                <span style={{ color: t.textPrimary }}>
                  {`${scheduledDays}d / ${Math.ceil(scheduledDays / 7)}w`}
                </span>
              </div>
              {(progressPercent > 0 || playedHours > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${t.borderSubtle}`, paddingTop: 4, marginTop: 2 }}>
                  <span>Remaining hrs</span>
                  <span style={{ color: t.textPrimary }}>{formatHours(liveRemainingHours)} / {formatHours(totalHours)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
