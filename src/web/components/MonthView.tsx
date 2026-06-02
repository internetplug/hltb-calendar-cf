import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { AppState, ScheduledGame, computeAllGameDays, formatHours, COMPLETION_LABELS } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  state: AppState;
  currentDate: Date;
  onNavigate: (d: Date) => void;
  dayOverrides: Record<string, number>;
  onUpdateDayOverride: (date: string, hours: number | null) => void;
  onUpdateGameDayOverride: (date: string, gameId: string, hours: number | null) => void;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface OverridePopoverProps {
  dateStr: string;
  currentValue: number; // the effective capacity (possibly from override)
  isOverride: boolean;
  onSet: (hours: number | null) => void;
  activeGames: ScheduledGame[];
  gamesOnDayHours: Map<string, number>;
  gameOverrides: Record<string, number>;
  onSetGameOverride: (gameId: string, hours: number | null) => void;
  onClose: () => void;
  anchorEl: HTMLElement;
}

function OverridePopover({
  dateStr, currentValue, isOverride, onSet,
  activeGames, gamesOnDayHours, gameOverrides, onSetGameOverride,
  onClose, anchorEl,
}: OverridePopoverProps) {
  const { theme: t } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(currentValue);

  const POP_WIDTH = 320;
  const rect = anchorEl.getBoundingClientRect();
  const [pos, setPos] = useState<{ top: number; left: number }>(() => ({
    top: rect.bottom + 4,
    left: Math.max(8, Math.min(rect.left, window.innerWidth - POP_WIDTH - 10)),
  }));

  useLayoutEffect(() => {
    if (!ref.current) return;
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const r = anchorEl.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + h > vh - 8) {
      const above = r.top - h - 4;
      top = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    setPos({ top, left });
  }, [anchorEl]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("mousedown", onMouseDown); };
  }, [anchorEl, onClose]);

  const scheduled = activeGames.filter(g =>
    (gamesOnDayHours.get(g.id) ?? 0) > 0 || g.id in gameOverrides
  );
  const others = activeGames.filter(g => !scheduled.includes(g));

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        background: t.bgElevated,
        border: `1px solid ${t.accentBorder}`,
        boxShadow: t.accentGlow !== "none" ? t.accentGlow : `0 4px 16px rgba(0,0,0,0.5)`,
        padding: "10px 12px",
        width: POP_WIDTH,
        maxHeight: `calc(100vh - ${pos.top + 16}px)`,
        overflowY: "auto",
        clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 14, color: t.textSecondary, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        {dateStr}
      </div>

      {/* Capacity */}
      <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Daily Capacity</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <button
          onClick={() => setVal(v => Math.max(0, parseFloat((v - 0.5).toFixed(1))))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 18, fontFamily: "DM Mono, monospace" }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "DM Mono, monospace", fontSize: 16, color: t.accent, fontWeight: 600 }}>
          {Math.round(val * 100) / 100}h
        </div>
        <button
          onClick={() => setVal(v => parseFloat((v + 0.5).toFixed(1)))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 18, fontFamily: "DM Mono, monospace" }}
        >+</button>
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
        <button
          onClick={() => onSet(val)}
          style={{
            flex: 1, padding: "5px 0", background: t.accentBg, border: `1px solid ${t.accentBorder}`,
            color: t.accentText, cursor: "pointer", fontSize: 13,
            fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >Set</button>
        {isOverride && (
          <button
            onClick={() => onSet(null)}
            style={{
              padding: "5px 8px", background: "transparent", border: `1px solid ${t.danger}`,
              color: t.danger, cursor: "pointer", fontSize: 11,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >Reset</button>
        )}
      </div>

      {/* Per-game overrides */}
      <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Game Hours</div>
      {scheduled.length === 0 ? (
        <div style={{ fontSize: 11, color: t.textDisabled, fontFamily: "DM Mono, monospace", padding: "4px 0" }}>
          No games scheduled.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {scheduled.map(g => {
            const ov = gameOverrides[g.id];
            const hasOv = ov !== undefined;
            const current = hasOv ? ov : (gamesOnDayHours.get(g.id) ?? 0);
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, boxShadow: `0 0 4px ${g.color}60`, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 12, color: t.textPrimary, fontFamily: "DM Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }} title={g.title}>
                  {g.title}
                </div>
                <button onClick={() => onSetGameOverride(g.id, Math.max(0, parseFloat((current - 0.5).toFixed(1))))}
                  style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 22, height: 22, cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>−</button>
                <div style={{
                  width: 44, textAlign: "center", fontSize: 12, fontFamily: "DM Mono, monospace",
                  color: hasOv ? g.color : t.textSecondary,
                  fontWeight: hasOv ? 600 : 400,
                }}>
                  {Math.round(current * 100) / 100}h{hasOv ? " ✦" : ""}
                </div>
                <button onClick={() => onSetGameOverride(g.id, parseFloat((current + 0.5).toFixed(1)))}
                  style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 22, height: 22, cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>+</button>
                {hasOv && (
                  <button onClick={() => onSetGameOverride(g.id, null)}
                    title="Reset to scheduled"
                    style={{ background: "transparent", border: `1px solid ${t.borderSubtle}`, color: t.textMuted, cursor: "pointer", padding: "1px 5px", fontSize: 11, fontFamily: "DM Mono, monospace", flexShrink: 0 }}>↻</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: t.textMuted, fontFamily: "DM Mono, monospace", padding: "3px 0", listStyle: "none" }}>
            + Pin another game
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5 }}>
            {others.map(g => (
              <button key={g.id}
                onClick={() => onSetGameOverride(g.id, 1)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "transparent", border: `1px solid ${t.borderSubtle}`, color: t.textSecondary,
                  cursor: "pointer", padding: "4px 6px",
                  fontSize: 11, fontFamily: "DM Mono, monospace", textAlign: "left",
                }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: g.color, opacity: 0.7, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>
                <span style={{ color: t.accent, fontSize: 11 }}>+ pin 1h</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function MonthView({ state, currentDate, onNavigate, dayOverrides, onUpdateDayOverride, onUpdateGameDayOverride }: Props) {
  const { theme: t } = useTheme();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const [popover, setPopover] = useState<{ dateStr: string; anchor: HTMLElement } | null>(null);

  const allGameDaysMap = useMemo(
    () => computeAllGameDays(state.games, state.schedule, state.schedulingMode, dayOverrides, state.gameDayOverrides),
    [state.games, state.schedule, state.schedulingMode, dayOverrides, state.gameDayOverrides]
  );
  const allGameDays = useMemo(() => state.games.map(game => ({ game, days: allGameDaysMap.get(game.id) ?? [] })), [state.games, allGameDaysMap]);
  const activeGamesSorted = useMemo(
    () => state.games.filter(g => !g.archived).sort((a, b) => a.priority - b.priority),
    [state.games]
  );

  const daysInMonth = getDaysInMonth(year, month);
  const firstDOW = getFirstDayOfWeek(year, month);

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDOW; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date().toISOString().split("T")[0];
  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function getGamesOnDate(dateStr: string) {
    return allGameDays
      .filter(({ days }) => days.some(d => d.date === dateStr))
      .map(({ game, days }) => ({ game, dayEntry: days.find(d => d.date === dateStr)! }));
  }

  const navBtnStyle = {
    background: t.bgElevated, border: `1px solid ${t.border}`,
    color: t.textPrimary, padding: "5px 14px", cursor: "pointer", fontSize: 15,
    fontFamily: "DM Mono, monospace",
  };

  function handleCapacityClick(e: React.MouseEvent<HTMLSpanElement>, dateStr: string) {
    e.stopPropagation();
    if (popover?.dateStr === dateStr) { setPopover(null); return; }
    setPopover({ dateStr, anchor: e.currentTarget as HTMLElement });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${t.border}` }}>
        <button onClick={() => onNavigate(new Date(year, month - 1, 1))} style={navBtnStyle}>◀</button>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.textPrimary }}>
          {monthName}
        </div>
        <button onClick={() => onNavigate(new Date(year, month + 1, 1))} style={navBtnStyle}>▶</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${t.border}` }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} style={{ padding: "7px 0", textAlign: "center", fontSize: 18, color: t.textSecondary, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", borderRight: `1px solid ${t.borderSubtle}` }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(110px, 1fr)", borderLeft: `1px solid ${t.borderSubtle}` }}>
        {cells.map((dateStr, i) => {
          const isToday = dateStr === today;
          const gamesOnDay = dateStr ? getGamesOnDate(dateStr) : [];
          const dow = dateStr ? new Date(dateStr + "T00:00:00").getDay() : 0;
          const hasOverride = dateStr ? dayOverrides[dateStr] !== undefined : false;
          const dayCapacity = dateStr
            ? (hasOverride ? dayOverrides[dateStr] : (state.schedule[dow] ?? 0))
            : 0;
          const overflow = gamesOnDay.length - 5;

          return (
            <div key={i} style={{
              borderRight: `1px solid ${t.borderSubtle}`,
              borderBottom: `1px solid ${t.borderSubtle}`,
              background: isToday ? t.bgElevated : dateStr ? t.bgBase : t.bgVoid,
              padding: "5px 5px 4px",
              minHeight: 110, overflow: "hidden",
              outline: hasOverride ? `1px solid ${t.accentBorder}` : "none",
              outlineOffset: -1,
            }}>
              {dateStr && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{
                      fontSize: 18, fontFamily: "Rajdhani, sans-serif",
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? t.accentText : t.textSecondary,
                      background: isToday ? t.accentBg : "transparent",
                      padding: isToday ? "1px 5px" : "0",
                      boxShadow: isToday && t.accentGlow !== "none" ? t.accentGlow : "none",
                    }}>
                      {parseInt(dateStr.split("-")[2])}
                    </span>
                    <span
                      title={hasOverride ? `Override: ${dayCapacity}h (click to edit)` : `${dayCapacity}h (click to override)`}
                      onClick={e => handleCapacityClick(e, dateStr)}
                      style={{
                        fontSize: 13,
                        color: hasOverride ? t.accent : t.textMuted,
                        cursor: "pointer",
                        padding: "1px 3px",
                        border: hasOverride ? `1px solid ${t.accentBorder}` : "1px solid transparent",
                        background: hasOverride ? t.accentBg : "transparent",
                        borderRadius: 2,
                        fontFamily: "DM Mono, monospace",
                        userSelect: "none",
                        transition: "all 0.15s",
                      }}
                    >
                      {dayCapacity > 0 ? `${dayCapacity}h` : "+"}
                      {hasOverride && <span style={{ marginLeft: 2, fontSize: 8 }}>✦</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {gamesOnDay.slice(0, 5).map(({ game, dayEntry }) => {
                      const isPinned = !!(dateStr && state.gameDayOverrides[dateStr] && game.id in state.gameDayOverrides[dateStr]);
                      return (
                      <div
                        key={game.id}
                        title={`${game.title}${game.archived ? " (archived)" : ""} — ${formatHours(dayEntry.hours)}${isPinned ? " (pinned)" : ""} (${COMPLETION_LABELS[game.completionType]})`}
                        style={{
                          height: 24,
                          background: `${game.color}${game.archived ? "11" : "22"}`,
                          borderLeft: `3px ${game.archived ? "dashed" : "solid"} ${game.color}`,
                          display: "flex", alignItems: "center", paddingLeft: 5,
                          fontSize: 20, color: game.color,
                          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                          fontFamily: "Rajdhani, sans-serif", fontWeight: 600,
                          opacity: game.archived ? 0.55 : 1,
                          boxShadow: !game.archived && (dayEntry.isStart || dayEntry.isEnd) ? `0 0 6px ${game.color}40` : "none",
                        }}
                      >
                        {game.archived && "✓ "}{!game.archived && dayEntry.isStart && "▶ "}{game.title.slice(0, 16)}{game.title.length > 16 ? "…" : ""}
                        {!game.archived && dayEntry.isEnd && " ✓"}
                        {isPinned && <span style={{ marginLeft: 4, fontSize: 12 }}>✦</span>}
                      </div>
                      );
                    })}
                    {overflow > 0 && <div style={{ fontSize: 10, color: t.textSecondary, paddingLeft: 4 }}>+{overflow} more</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {popover && (() => {
        const hasOv = dayOverrides[popover.dateStr] !== undefined;
        const dow = new Date(popover.dateStr + "T00:00:00").getDay();
        const effective = hasOv ? dayOverrides[popover.dateStr] : (state.schedule[dow] ?? 0);
        const gamesOnDayHours = new Map<string, number>();
        for (const [gameId, entries] of allGameDaysMap) {
          const entry = entries.find(e => e.date === popover.dateStr);
          if (entry) gamesOnDayHours.set(gameId, entry.hours);
        }
        const gameOverrides = state.gameDayOverrides[popover.dateStr] ?? {};
        return (
          <OverridePopover
            dateStr={popover.dateStr}
            currentValue={effective}
            isOverride={hasOv}
            onSet={(h) => onUpdateDayOverride(popover.dateStr, h)}
            activeGames={activeGamesSorted}
            gamesOnDayHours={gamesOnDayHours}
            gameOverrides={gameOverrides}
            onSetGameOverride={(gameId, h) => onUpdateGameDayOverride(popover.dateStr, gameId, h)}
            onClose={() => setPopover(null)}
            anchorEl={popover.anchor}
          />
        );
      })()}
    </div>
  );
}
