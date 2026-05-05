import { useMemo, useState, useRef, useEffect } from "react";
import { AppState, computeAllGameDays, formatHours, COMPLETION_LABELS } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  state: AppState;
  currentDate: Date;
  onNavigate: (d: Date) => void;
  dayOverrides: Record<string, number>;
  onUpdateDayOverride: (date: string, hours: number | null) => void;
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
  onClose: () => void;
  anchorEl: HTMLElement;
}

function OverridePopover({ dateStr, currentValue, isOverride, onSet, onClose, anchorEl }: OverridePopoverProps) {
  const { theme: t } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(currentValue);

  // Position below anchor
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
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 18, fontFamily: "DM Mono, monospace" }}
        >−</button>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "DM Mono, monospace", fontSize: 16, color: t.accent, fontWeight: 600 }}>
          {val}h
        </div>
        <button
          onClick={() => setVal(v => parseFloat((v + 0.5).toFixed(1)))}
          style={{ background: t.bgBase, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 18, fontFamily: "DM Mono, monospace" }}
        >+</button>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={() => { onSet(val); onClose(); }}
          style={{
            flex: 1, padding: "5px 0", background: t.accentBg, border: `1px solid ${t.accentBorder}`,
            color: t.accentText, cursor: "pointer", fontSize: 15,
            fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          }}
        >Set</button>
        {isOverride && (
          <button
            onClick={() => { onSet(null); onClose(); }}
            style={{
              padding: "5px 8px", background: "transparent", border: `1px solid ${t.danger}`,
              color: t.danger, cursor: "pointer", fontSize: 11,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >Reset</button>
        )}
      </div>
    </div>
  );
}

export function MonthView({ state, currentDate, onNavigate, dayOverrides, onUpdateDayOverride }: Props) {
  const { theme: t } = useTheme();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const [popover, setPopover] = useState<{ dateStr: string; anchor: HTMLElement } | null>(null);

  const allGameDaysMap = useMemo(
    () => computeAllGameDays(state.games, state.schedule, state.schedulingMode, dayOverrides),
    [state.games, state.schedule, state.schedulingMode, dayOverrides]
  );
  const allGameDays = useMemo(() => state.games.map(game => ({ game, days: allGameDaysMap.get(game.id) ?? [] })), [state.games, allGameDaysMap]);

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
                    {gamesOnDay.slice(0, 5).map(({ game, dayEntry }) => (
                      <div
                        key={game.id}
                        title={`${game.title} — ${formatHours(dayEntry.hours)} (${COMPLETION_LABELS[game.completionType]})`}
                        style={{
                          height: 24,
                          background: `${game.color}22`,
                          borderLeft: `3px solid ${game.color}`,
                          display: "flex", alignItems: "center", paddingLeft: 5,
                          fontSize: 20, color: game.color,
                          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                          fontFamily: "Rajdhani, sans-serif", fontWeight: 600,
                          boxShadow: dayEntry.isStart || dayEntry.isEnd ? `0 0 6px ${game.color}40` : "none",
                        }}
                      >
                        {dayEntry.isStart && "▶ "}{game.title.slice(0, 16)}{game.title.length > 16 ? "…" : ""}
                        {dayEntry.isEnd && " ✓"}
                      </div>
                    ))}
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
