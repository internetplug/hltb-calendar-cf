import { useMemo, useState, useRef, useEffect } from "react";
import { AppState, computeAllGameDays, formatHours, COMPLETION_LABELS, DAY_NAMES_FULL } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  state: AppState;
  currentDate: Date;
  onNavigate: (d: Date) => void;
  dayOverrides: Record<string, number>;
  onUpdateDayOverride: (date: string, hours: number | null) => void;
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
  onClose: () => void;
  anchorEl: HTMLElement;
}

function OverridePopover({ dateStr, currentValue, isOverride, onSet, onClose, anchorEl }: OverridePopoverProps) {
  const { theme: t } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(currentValue);
  const rect = anchorEl.getBoundingClientRect();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("mousedown", onMouseDown); };
  }, [anchorEl, onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 170),
        zIndex: 9999,
        background: t.bgElevated,
        border: `1px solid ${t.accentBorder}`,
        boxShadow: t.accentGlow !== "none" ? t.accentGlow : `0 4px 16px rgba(0,0,0,0.5)`,
        padding: "10px 12px",
        minWidth: 160,
        clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 14, color: t.textSecondary, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        {dateStr} capacity
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => setVal(v => Math.max(0, parseFloat((v - 0.5).toFixed(1))))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 15, fontFamily: "DM Mono, monospace" }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "DM Mono, monospace", fontSize: 16, color: t.accent, fontWeight: 600 }}>
          {val}h
        </div>
        <button
          onClick={() => setVal(v => parseFloat((v + 0.5).toFixed(1)))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 15, fontFamily: "DM Mono, monospace" }}
        >+</button>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={() => { onSet(val); onClose(); }}
          style={{
            flex: 1, padding: "5px 0", background: t.accentBg, border: `1px solid ${t.accentBorder}`,
            color: t.accentText, cursor: "pointer", fontSize: 14,
            fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >Set</button>
        {isOverride && (
          <button
            onClick={() => { onSet(null); onClose(); }}
            style={{
              padding: "5px 8px", background: "transparent", border: `1px solid ${t.danger}`,
              color: t.danger, cursor: "pointer", fontSize: 14,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >Reset</button>
        )}
      </div>
    </div>
  );
}

export function WeekView({ state, currentDate, onNavigate, dayOverrides, onUpdateDayOverride }: Props) {
  const { theme: t } = useTheme();
  const weekStart = getWeekStart(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [popover, setPopover] = useState<{ dateStr: string; anchor: HTMLElement } | null>(null);

  const allGameDaysMap = useMemo(
    () => computeAllGameDays(state.games, state.schedule, state.schedulingMode, dayOverrides),
    [state.games, state.schedule, state.schedulingMode, dayOverrides]
  );
  const allGameDays = useMemo(() => state.games.map(game => ({ game, days: allGameDaysMap.get(game.id) ?? [] })), [state.games, allGameDaysMap]);

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
                {gamesOnDay.map(({ game, dayEntry }) => (
                  <div
                    key={game.id}
                    title={`${game.title}\n${COMPLETION_LABELS[game.completionType]}\n${formatHours(dayEntry.hours)} today`}
                    style={{
                      background: `${game.color}12`,
                      border: `1px solid ${game.color}40`,
                      borderLeft: `3px solid ${game.color}`,
                      padding: "6px 7px",
                      clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)",
                      boxShadow: dayEntry.isStart || dayEntry.isEnd ? `0 0 8px ${game.color}30` : "none",
                    }}
                  >
                    {game.imageUrl && (
                      <img src={game.imageUrl} alt="" style={{ width: "100%", height: 60, objectFit: "cover", marginBottom: 5, opacity: 0.7 }} />
                    )}
                    <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 600, color: t.textPrimary, lineHeight: 1.2, marginBottom: 3 }}>
                      {game.title}
                    </div>
                    <div style={{ fontSize: 14, color: game.color }}>{formatHours(dayEntry.hours)}</div>
                    {dayEntry.isStart && <div style={{ fontSize: 14, color: t.success, marginTop: 2 }}>▶ START</div>}
                    {dayEntry.isEnd && <div style={{ fontSize: 14, color: t.warning, marginTop: 2 }}>✓ FINISH</div>}
                    <div style={{ marginTop: 5, height: 2, background: t.border }}>
                      <div style={{ height: "100%", width: `${dayEntry.progress * 100}%`, background: game.color, opacity: 0.7 }} />
                    </div>
                  </div>
                ))}
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
        return (
          <OverridePopover
            dateStr={popover.dateStr}
            currentValue={effective}
            isOverride={hasOv}
            onSet={(h) => onUpdateDayOverride(popover.dateStr, h)}
            onClose={() => setPopover(null)}
            anchorEl={popover.anchor}
          />
        );
      })()}
    </div>
  );
}
