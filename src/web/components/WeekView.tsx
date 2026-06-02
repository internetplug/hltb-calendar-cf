import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { AppState, ScheduledGame, computeAllGameDays, formatHours, COMPLETION_LABELS, DAY_NAMES_FULL } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  state: AppState;
  currentDate: Date;
  onNavigate: (d: Date) => void;
  dayOverrides: Record<string, number>;
  onUpdateDayOverride: (date: string, hours: number | null) => void;
  onUpdateGameDayOverride: (date: string, gameId: string, hours: number | null) => void;
}

function getWeekStart(d: Date): Date {
  const s = new Date(d);
  s.setDate(d.getDate() - d.getDay());
  return s;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface OverridePopoverProps {
  dateStr: string;
  currentValue: number;
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

      <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Daily Capacity</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <button
          onClick={() => setVal(v => Math.max(0, parseFloat((v - 0.5).toFixed(1))))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 15, fontFamily: "DM Mono, monospace" }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "DM Mono, monospace", fontSize: 16, color: t.accent, fontWeight: 600 }}>
          {Math.round(val * 100) / 100}h
        </div>
        <button
          onClick={() => setVal(v => parseFloat((v + 0.5).toFixed(1)))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 15, fontFamily: "DM Mono, monospace" }}
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

export function WeekView({ state, currentDate, onNavigate, dayOverrides, onUpdateDayOverride, onUpdateGameDayOverride }: Props) {
  const { theme: t } = useTheme();
  const weekStart = getWeekStart(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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

  const today = new Date().toISOString().split("T")[0];
  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const navBtnStyle = { background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, padding: "5px 14px", cursor: "pointer" as const, fontSize: 15 };

  function handleCapacityClick(e: React.MouseEvent, dateStr: string) {
    e.stopPropagation();
    if (popover?.dateStr === dateStr) { setPopover(null); return; }
    setPopover({ dateStr, anchor: e.currentTarget as HTMLElement });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${t.border}` }}>
        <button onClick={() => onNavigate(addDays(currentDate, -7))} style={navBtnStyle}>◀</button>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.textPrimary }}>
          {weekLabel}
        </div>
        <button onClick={() => onNavigate(addDays(currentDate, 7))} style={navBtnStyle}>▶</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {weekDays.map((day, i) => {
          const dateStr = toDateStr(day);
          const isToday = dateStr === today;
          const dayOfWeek = day.getDay();
          const hasOverride = dayOverrides[dateStr] !== undefined;
          const capacity = hasOverride ? dayOverrides[dateStr] : (state.schedule[dayOfWeek] ?? 0);
          const gamesOnDay = allGameDays
            .filter(({ days }) => days.some(d => d.date === dateStr))
            .map(({ game, days }) => ({ game, dayEntry: days.find(d => d.date === dateStr)! }));

          const totalHoursUsed = gamesOnDay.reduce((s, { dayEntry }) => s + dayEntry.hours, 0);
          const utilizationPct = capacity > 0 ? Math.min(100, (totalHoursUsed / capacity) * 100) : 0;

          return (
            <div key={dateStr} style={{
              borderRight: i < 6 ? `1px solid ${t.borderSubtle}` : "none",
              background: isToday ? t.bgElevated : t.bgBase,
              display: "flex", flexDirection: "column", minHeight: 400,
              outline: hasOverride ? `1px solid ${t.accentBorder}` : "none",
              outlineOffset: -1,
            }}>
              {/* Day header */}
              <div style={{
                padding: "10px 10px 8px",
                borderBottom: `1px solid ${t.border}`,
                background: isToday ? t.accentBg : t.bgBase,
              }}>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 600, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {DAY_NAMES_FULL[dayOfWeek].slice(0, 3)}
                </div>
                <div style={{
                  fontFamily: "Rajdhani, sans-serif", fontSize: 30, fontWeight: 700,
                  color: isToday ? t.accentText : t.textPrimary, lineHeight: 1,
                  textShadow: isToday && t.accentGlow !== "none" ? `0 0 12px ${t.accent}60` : "none",
                }}>
                  {day.getDate()}
                </div>
                {capacity > 0 ? (
                  <div
                    style={{ marginTop: 5, cursor: "pointer" }}
                    title={hasOverride ? `Override: ${capacity}h — click to edit` : `${capacity}h — click to override`}
                    onClick={(e) => handleCapacityClick(e, dateStr)}
                  >
                    <div style={{
                      height: 2,
                      background: t.border,
                      borderRadius: 1,
                      overflow: "hidden",
                      outline: hasOverride ? `1px solid ${t.accentBorder}` : "none",
                      outlineOffset: 1,
                    }}>
                      <div style={{ height: "100%", width: `${utilizationPct}%`, background: utilizationPct > 90 ? t.danger : t.accent, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: 13, color: hasOverride ? t.accent : t.textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                      {Math.round(totalHoursUsed * 10) / 10}/{capacity}h
                      {hasOverride && <span style={{ fontSize: 13, color: t.accent }}>✦</span>}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{ fontSize: 13, color: t.textMuted, marginTop: 9, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}
                    title="Click to set capacity override"
                    onClick={(e) => handleCapacityClick(e, dateStr)}
                  >
                    rest day
                    {hasOverride && <span style={{ fontSize: 13, color: t.accent }}>✦</span>}
                  </div>
                )}
              </div>

              {/* Games */}
              <div style={{ flex: 1, padding: "6px 5px", display: "flex", flexDirection: "column", gap: 5 }}>
                {gamesOnDay.map(({ game, dayEntry }) => {
                  const isPinned = !!(state.gameDayOverrides[dateStr] && game.id in state.gameDayOverrides[dateStr]);
                  return (
                  <div
                    key={game.id}
                    title={`${game.title}${game.archived ? " (archived)" : ""}\n${COMPLETION_LABELS[game.completionType]}\n${formatHours(dayEntry.hours)} today${isPinned ? " (pinned)" : ""}`}
                    style={{
                      background: `${game.color}${game.archived ? "08" : "12"}`,
                      border: `1px ${game.archived ? "dashed" : "solid"} ${game.color}40`,
                      borderLeft: `3px ${game.archived ? "dashed" : "solid"} ${game.color}`,
                      padding: "6px 7px",
                      clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)",
                      opacity: game.archived ? 0.6 : 1,
                      boxShadow: !game.archived && (dayEntry.isStart || dayEntry.isEnd) ? `0 0 8px ${game.color}30` : "none",
                    }}
                  >
                    {game.imageUrl && (
                      <img src={game.imageUrl} alt="" style={{ width: "100%", height: 60, objectFit: "cover", marginBottom: 5, opacity: game.archived ? 0.4 : 0.7, filter: game.archived ? "grayscale(40%)" : "none" }} />
                    )}
                    <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 600, color: t.textPrimary, lineHeight: 1.2, marginBottom: 3 }}>
                      {game.archived && <span style={{ color: t.success, marginRight: 5 }}>✓</span>}{game.title}
                      {isPinned && <span style={{ marginLeft: 6, fontSize: 13, color: t.accent }}>✦</span>}
                    </div>
                    <div style={{ fontSize: 14, color: game.color }}>{formatHours(dayEntry.hours)}</div>
                    {game.archived ? (
                      <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>Archived</div>
                    ) : (
                      <>
                        {dayEntry.isStart && <div style={{ fontSize: 14, color: t.success, marginTop: 2 }}>▶ START</div>}
                        {dayEntry.isEnd && <div style={{ fontSize: 14, color: t.warning, marginTop: 2 }}>✓ FINISH</div>}
                      </>
                    )}
                    <div style={{ marginTop: 5, height: 2, background: t.border }}>
                      <div style={{ height: "100%", width: `${dayEntry.progress * 100}%`, background: game.color, opacity: 0.7 }} />
                    </div>
                  </div>
                  );
                })}
                {gamesOnDay.length === 0 && capacity > 0 && (
                  <div style={{ color: t.textDisabled, fontSize: 15, textAlign: "center", paddingTop: 20, fontFamily: "DM Mono, monospace" }}>—</div>
                )}
              </div>
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
