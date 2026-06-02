import { useState } from "react";
import {
  AppState, ScheduledGame, SchedulingMode,
  computeAllGameDays, computeGameDays,
  formatHours, formatDate, getGameHours, getTotalHours,
  DAY_NAMES, COMPLETION_LABELS,
} from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";
import { GameSearch } from "./GameSearch";
import { ColorPicker } from "./ColorPicker";
import { AuthModal } from "./AuthModal";
import { ScheduleConfig } from "./ScheduleConfig";
import { ThemePicker } from "./ThemePicker";

interface User { id: string; email: string; }

interface Props {
  state: AppState;
  user: User | null;
  syncStatus: "idle" | "saving" | "saved" | "error";
  onUpdateState: (patch: Partial<AppState>) => void;
  onAddGame: (game: Omit<ScheduledGame, "id">) => void;
  onRemoveGame: (id: string) => void;
  onArchiveGame: (id: string) => void;
  onUnarchiveGame: (id: string) => void;
  onUpdateGame: (id: string, patch: Partial<ScheduledGame>) => void;
  onReorderGames: (games: ScheduledGame[]) => void;
  onUpdateDayOverride: (date: string, hours: number | null) => void;
  onUpdateGameDayOverride: (date: string, gameId: string, hours: number | null) => void;
  onAuth: (u: User) => void;
  onLogout: () => void;
}

type MobileTab = "games" | "calendar" | "settings";

// ─── Bottom Tab Bar ───────────────────────────────────────────────────────────
function TabBar({ active, onChange, t }: { active: MobileTab; onChange: (t: MobileTab) => void; t: ReturnType<typeof useTheme>["theme"] }) {
  const tabs: { key: MobileTab; label: string; icon: string }[] = [
    { key: "games", label: "Library" },
    { key: "calendar", label: "Schedule" },
    { key: "settings", label: "Settings" },
  ];
  return (
    <div style={{
      display: "flex", height: 58,
      background: t.bgBase, borderTop: `1px solid ${t.border}`,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.key;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 2,
            background: "transparent", border: "none", cursor: "pointer",
            color: isActive ? t.accentText : t.textSecondary,
            borderTop: isActive ? `2px solid ${t.accent}` : "2px solid transparent",
            transition: "all 0.15s", padding: "6px 0 0",
          }}>
            <span style={{ fontSize: 18 }}>{tab.icon}</span>
            <span style={{ fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Mobile Header ────────────────────────────────────────────────────────────
function MobileHeader({ title, t, right }: { title: string; t: ReturnType<typeof useTheme>["theme"]; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      height: 52, padding: "0 16px", flexShrink: 0,
      background: t.bgBase, borderBottom: `1px solid ${t.border}`,
    }}>
      <div>
        <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: "0.06em", color: t.accentText, textShadow: t.accentGlow !== "none" ? `0 0 12px ${t.accent}50` : "none" }}>
          HLTB<span style={{ color: t.textPrimary }}>CALENDAR</span>
        </span>
        <span style={{ marginLeft: 10, fontSize: 14, color: t.textMuted, fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {title}
        </span>
      </div>
      {right}
    </div>
  );
}

// ─── Games Tab ────────────────────────────────────────────────────────────────
function GamesTab({ state, onAdd, onRemove, onArchive, onUnarchive, onUpdateGame }: {
  state: AppState;
  onAdd: (g: Omit<ScheduledGame, "id">) => void;
  onRemove: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onUpdateGame: (id: string, patch: Partial<ScheduledGame>) => void;
}) {
  const { theme: t } = useTheme();
  const [subTab, setSubTab] = useState<"list" | "archive" | "add">("list");
  const activeGames = state.games.filter(g => !g.archived);
  const archivedGames = state.games.filter(g => g.archived);
  const sortedGames = [...activeGames].sort((a, b) => a.priority - b.priority);
  const sortedArchived = [...archivedGames].sort((a, b) => {
    const aEnd = a.archivedDays[a.archivedDays.length - 1]?.date ?? "";
    const bEnd = b.archivedDays[b.archivedDays.length - 1]?.date ?? "";
    return bEnd.localeCompare(aEnd);
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <MobileHeader title="Library" t={t} />

      {/* Sub-tabs */}
      <div style={{ display: "flex", background: t.bgBase, borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        {(["list", "archive", "add"] as const).map(st => (
          <button key={st} onClick={() => setSubTab(st)} style={{
            flex: 1, padding: "10px 0",
            background: "transparent", border: "none",
            borderBottom: subTab === st ? `2px solid ${t.accent}` : "2px solid transparent",
            color: subTab === st ? t.accentText : t.textSecondary,
            cursor: "pointer", fontSize: 14,
            fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {st === "list" ? `Games (${activeGames.length})` : st === "archive" ? `Archive (${archivedGames.length})` : "+ Add"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {subTab === "add" ? (
          <GameSearch
            onAdd={(g) => { onAdd(g); setSubTab("list"); }}
            existingColors={state.games.map(g => g.color)}
            nextPriority={activeGames.length + 1}
          />
        ) : subTab === "archive" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedArchived.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "48px 16px", lineHeight: 1.7 }}>
                No archived games yet.<br />
                <span style={{ fontSize: 12 }}>Finish a game and tap ✓ to archive it.</span>
              </div>
            ) : (
              sortedArchived.map(game => (
                <MobileArchivedCard
                  key={game.id} game={game}
                  onUnarchive={() => onUnarchive(game.id)}
                  onRemove={() => onRemove(game.id)}
                />
              ))
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedGames.length === 0 ? (
              <div style={{ color: t.textMuted, fontSize: 16, textAlign: "center", padding: "48px 16px", lineHeight: 2 }}>
                No games yet.<br />
                <button onClick={() => setSubTab("add")} style={{ background: "none", border: "none", color: t.accentText, cursor: "pointer", fontSize: 16, fontFamily: "DM Mono, monospace" }}>
                  + Add your first game
                </button>
              </div>
            ) : (
              sortedGames.map((game, idx) => (
                <MobileGameCard
                  key={game.id} game={game} state={state}
                  isHighestPriority={idx === 0}
                  onRemove={() => onRemove(game.id)}
                  onArchive={() => onArchive(game.id)}
                  onUpdate={(patch) => onUpdateGame(game.id, patch)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MobileArchivedCard({ game, onUnarchive, onRemove }: {
  game: ScheduledGame; onUnarchive: () => void; onRemove: () => void;
}) {
  const { theme: t } = useTheme();
  const totalHoursPlayed = game.archivedHoursPlayed;
  const startDate = game.archivedDays[0]?.date ?? game.startDate;
  const endDate = game.archivedDays[game.archivedDays.length - 1]?.date ?? game.startDate;

  return (
    <div style={{
      background: t.bgSurface, border: `1px solid ${t.border}`,
      clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
      overflow: "hidden", opacity: 0.85,
    }}>
      <div style={{ height: 2, background: `${game.color}80` }} />
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {game.imageUrl
            ? <img src={game.imageUrl} alt="" style={{ width: 40, height: 52, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.borderSubtle}`, filter: "grayscale(30%)" }} />
            : <div style={{ width: 40, height: 52, background: t.bgElevated, flexShrink: 0 }} />
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: t.textPrimary, flex: 1 }}>
                <span style={{ color: t.success, marginRight: 6 }}>✓</span>{game.title}
              </div>
              <button onClick={onRemove} title="Delete permanently" style={{ background: "none", border: "none", color: t.danger, cursor: "pointer", fontSize: 14, padding: "2px 4px", flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
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
            <button
              onClick={onUnarchive}
              style={{
                marginTop: 8, background: "transparent", border: `1px solid ${t.border}`,
                color: t.textSecondary, cursor: "pointer", padding: "5px 10px",
                fontSize: 11, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >Unarchive</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileGameCard({ game, state, isHighestPriority, onRemove, onArchive, onUpdate }: {
  game: ScheduledGame; state: AppState; isHighestPriority: boolean;
  onRemove: () => void; onArchive: () => void; onUpdate: (p: Partial<ScheduledGame>) => void;
}) {
  const { theme: t } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const days = computeGameDays(game, state.schedule, state.games, state.schedulingMode);
  const endDate = days.length > 0 ? days[days.length - 1].date : game.startDate;
  const remainingHours = getGameHours(game);
  const totalHours = getTotalHours(game);
  const totalDays = Math.ceil((new Date(endDate + "T00:00:00").getTime() - new Date(game.startDate + "T00:00:00").getTime()) / 86400000) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const progressPercent = game.progressPercent ?? 0;

  return (
    <div style={{
      background: t.bgSurface, border: `1px solid ${t.border}`,
      clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
      overflow: "hidden",
    }}>
      {/* Color strip */}
      <div style={{ height: 2, background: game.color, boxShadow: `0 0 6px ${game.color}60` }} />

      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {game.imageUrl
            ? <img src={game.imageUrl} alt="" style={{ width: 40, height: 52, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.borderSubtle}` }} />
            : <div style={{ width: 40, height: 52, background: t.bgElevated, flexShrink: 0 }} />
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: t.textPrimary, flex: 1, marginRight: 8 }}>
                {game.title}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: t.textSecondary, cursor: "pointer", fontSize: 16, padding: "2px 4px" }}>
                  {expanded ? "▲" : "▼"}
                </button>
                <button onClick={onArchive} title="Archive (finished)" style={{ background: "none", border: "none", color: t.success, cursor: "pointer", fontSize: 16, padding: "2px 4px" }}>✓</button>
                <button onClick={onRemove} title="Delete permanently" style={{ background: "none", border: "none", color: t.danger, cursor: "pointer", fontSize: 16, padding: "2px 4px" }}>✕</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ fontSize: 14, color: game.color, background: `${game.color}18`, padding: "1px 7px" }}>
                {formatHours(remainingHours)}
              </span>
              <span style={{ fontSize: 12, color: t.textSecondary }}>~{totalWeeks}w</span>
              <span style={{ fontSize: 12, color: t.textMuted }}>P{game.priority}</span>
              {progressPercent > 0 && (
                <span style={{ fontSize: 12, color: t.textSecondary, background: t.bgElevated, padding: "1px 5px" }}>{progressPercent}% done</span>
              )}
            </div>
            <div style={{ marginTop: 4, display: "flex", gap: 8, fontSize: 12, color: t.textMuted }}>
              <span>{formatDate(game.startDate)}</span>
              <span>→</span>
              <span style={{ color: game.color }}>{formatDate(endDate)}</span>
            </div>
          </div>
        </div>

        {expanded && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Color */}
            <div>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Color</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorPicker color={game.color} onChange={c => onUpdate({ color: c })} />
                <span style={{ fontSize: 12, fontFamily: "DM Mono, monospace", color: t.textSecondary }}>{game.color}</span>
              </div>
            </div>

            {/* Mode */}
            <div>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Completion Mode</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {(["main", "main_sides", "completionist", "average"] as const).map(ct => {
                  const h = game.hltb[ct];
                  const active = game.completionType === ct;
                  return (
                    <button key={ct} onClick={() => h !== null && onUpdate({ completionType: ct })} disabled={h === null} style={{
                      padding: "6px 8px",
                      background: active ? `${game.color}18` : "transparent",
                      border: `1px solid ${active ? game.color : t.border}`,
                      color: h === null ? t.textDisabled : active ? game.color : t.textSecondary,
                      cursor: h === null ? "not-allowed" : "pointer",
                      fontSize: 12, fontFamily: "DM Mono, monospace", textAlign: "left",
                      clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%)",
                    }}>
                      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 2 }}>{COMPLETION_LABELS[ct]}</div>
                      <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 700 }}>{formatHours(h)}</div>
                    </button>
                  );
                })}
                <button onClick={() => onUpdate({ completionType: "custom" })} style={{
                  padding: "6px 8px",
                  background: game.completionType === "custom" ? `${game.color}18` : "transparent",
                  border: `1px solid ${game.completionType === "custom" ? game.color : t.border}`,
                  color: game.completionType === "custom" ? game.color : t.textSecondary,
                  cursor: "pointer", fontSize: 12, fontFamily: "DM Mono, monospace", textAlign: "left",
                  clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%)",
                }}>
                  <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 2 }}>Custom</div>
                  <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 700 }}>
                    {game.customHours != null ? `${game.customHours}h` : "—"}
                  </div>
                </button>
              </div>
              {game.completionType === "custom" && (
                <input type="number" min={0.5} step={0.5} value={game.customHours ?? ""} placeholder="Custom hours"
                  onChange={e => { const v = parseFloat(e.target.value); onUpdate({ customHours: isNaN(v) ? null : v }); }}
                  style={{ marginTop: 8, width: "100%", background: t.bgInput, border: `1px solid ${game.color}40`, color: t.textPrimary, padding: "6px 8px", fontSize: 16, fontFamily: "DM Mono, monospace", outline: "none", colorScheme: "dark" }}
                />
              )}
            </div>

            {/* Progress */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>Already Completed</div>
                <span style={{ fontSize: 14, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, color: progressPercent > 0 ? game.color : t.textDisabled }}>{progressPercent}%</span>
              </div>
              <input type="range" min={0} max={99} value={progressPercent}
                onChange={e => onUpdate({ progressPercent: parseInt(e.target.value) })}
                style={{ width: "100%", accentColor: game.color, cursor: "pointer" }}
              />
            </div>

            {/* Start date */}
            <div>
              <div style={{ color: t.textSecondary, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Start Date</div>
              <input type="date" value={game.startDate}
                onChange={e => onUpdate({ startDate: e.target.value })}
                style={{ width: "100%", background: t.bgInput, border: `1px solid ${t.border}`, color: t.textPrimary, padding: "6px 8px", fontSize: 14, fontFamily: "DM Mono, monospace", outline: "none", colorScheme: "dark" }}
              />
            </div>

            {/* Timeline summary */}
            <div style={{ fontSize: 12, color: t.textSecondary, background: t.bgInput, border: `1px solid ${t.borderSubtle}`, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Finish</span><span style={{ color: game.color }}>{formatDate(endDate)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Duration</span><span style={{ color: t.textPrimary }}>{totalDays}d / {totalWeeks}w</span>
              </div>
              {progressPercent > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${t.borderSubtle}`, paddingTop: 4, marginTop: 2 }}>
                  <span>Remaining</span>
                  <span style={{ color: t.textPrimary }}>{formatHours(remainingHours)} / {formatHours(totalHours)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Week view helpers ────────────────────────────────────────────────────────
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

// ─── Calendar Tab ─────────────────────────────────────────────────────────────
function CalendarTab({ state, onUpdateState, onUpdateDayOverride, onUpdateGameDayOverride }: {
  state: AppState;
  onUpdateState: (p: Partial<AppState>) => void;
  onUpdateDayOverride: (date: string, hours: number | null) => void;
  onUpdateGameDayOverride: (date: string, gameId: string, hours: number | null) => void;
}) {
  const { theme: t } = useTheme();
  const currentDate = new Date(state.calendarDate + "T00:00:00");
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Build date → [{gameId, gameTitle, gameColor, hours, archived}] map
  const gameDayMap = computeAllGameDays(state.games, state.schedule, state.schedulingMode, state.dayOverrides, state.gameDayOverrides);
  const activeGamesSorted = [...state.games].filter(g => !g.archived).sort((a, b) => a.priority - b.priority);
  const gameById = new Map(state.games.map(g => [g.id, g]));
  type DayEntry = { gameId: string; gameTitle: string; gameColor: string; hours: number; archived: boolean };
  const dayMap: Record<string, DayEntry[]> = {};
  for (const [gameId, entries] of gameDayMap) {
    const game = gameById.get(gameId);
    if (!game) continue;
    for (const entry of entries) {
      if (!dayMap[entry.date]) dayMap[entry.date] = [];
      dayMap[entry.date].push({ gameId, gameTitle: game.title, gameColor: game.color, hours: entry.hours, archived: game.archived });
    }
  }

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weekStart = getWeekStart(currentDate);
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const navigate = (delta: number) => {
    if (state.calendarView === "week") {
      onUpdateState({ calendarDate: toDateStr(addDays(currentDate, delta * 7)) });
    } else {
      const d = new Date(year, month + delta, 1);
      onUpdateState({ calendarDate: d.toISOString().split("T")[0] });
    }
    setSelectedDay(null);
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <MobileHeader title="Schedule" t={t} right={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ display: "flex" }}>
            {(["month", "week"] as const).map((v, i) => {
              const active = state.calendarView === v;
              return (
                <button key={v} onClick={() => { onUpdateState({ calendarView: v, ...(v === "week" ? { calendarDate: new Date().toISOString().split("T")[0] } : {}) }); setSelectedDay(null); }} style={{
                  padding: "4px 9px",
                  background: active ? t.accentBg : "transparent",
                  border: `1px solid ${active ? t.accent : t.border}`,
                  borderRight: i === 0 ? `1px solid ${t.border}` : undefined,
                  color: active ? t.accentText : t.textSecondary,
                  cursor: "pointer", fontSize: 10,
                  fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  {v === "month" ? "M" : "W"}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex" }}>
            {(["priority", "split"] as SchedulingMode[]).map((m, i) => {
              const active = state.schedulingMode === m;
              return (
                <button key={m} onClick={() => onUpdateState({ schedulingMode: m })} style={{
                  padding: "4px 9px",
                  background: active ? t.accentBg : "transparent",
                  border: `1px solid ${active ? t.accent : t.border}`,
                  borderRight: i === 0 ? `1px solid ${t.border}` : undefined,
                  color: active ? t.accentText : t.textSecondary,
                  cursor: "pointer", fontSize: 10,
                  fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  {m === "priority" ? "P" : "S"}
                </button>
              );
            })}
          </div>
        </div>
      } />

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 8px", flexShrink: 0 }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: `1px solid ${t.border}`, color: t.textSecondary, cursor: "pointer", width: 32, height: 32, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: state.calendarView === "week" ? 15 : 20, fontWeight: 700, letterSpacing: "0.06em", color: t.textPrimary }}>
            {state.calendarView === "week" ? weekLabel : <>{monthNames[month]} <span style={{ color: t.textMuted }}>{year}</span></>}
          </div>
          <button onClick={() => navigate(1)} style={{ background: "none", border: `1px solid ${t.border}`, color: t.textSecondary, cursor: "pointer", width: 32, height: 32, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>

        {state.calendarView === "week" ? (
          <MobileWeekView
            weekStart={weekStart}
            dayMap={dayMap}
            schedule={state.schedule}
            dayOverrides={state.dayOverrides}
            gameDayOverrides={state.gameDayOverrides}
            activeGames={activeGamesSorted}
            onUpdateDayOverride={onUpdateDayOverride}
            onUpdateGameDayOverride={onUpdateGameDayOverride}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            t={t}
          />
        ) : (
          <>
            {/* Day names header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 8px", gap: 2 }}>
              {DAY_NAMES.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.08em", color: t.textMuted, paddingBottom: 4 }}>{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 8px", gap: 2 }}>
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const entries = dayMap[dateStr] ?? [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDay;
                const uniqueGames = entries.filter((e, idx, arr) => arr.findIndex(x => x.gameId === e.gameId) === idx);
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                    style={{
                      aspectRatio: "1",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                      padding: "4px 2px 2px",
                      background: isSelected ? t.accentBg : isToday ? `${t.accent}15` : "transparent",
                      border: isSelected ? `1px solid ${t.accent}` : isToday ? `1px solid ${t.accent}60` : `1px solid transparent`,
                      cursor: "pointer", borderRadius: 2, overflow: "hidden", gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: isToday ? 700 : 400, color: isToday ? t.accentText : t.textPrimary, lineHeight: 1 }}>
                      {day}
                    </span>
                    {entries.length > 0 && (
                      <div style={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", maxHeight: 12 }}>
                        {uniqueGames.slice(0, 3).map(e => (
                          <div key={e.gameId} style={{ width: 5, height: 5, borderRadius: "50%", background: e.gameColor, boxShadow: e.archived ? "none" : `0 0 3px ${e.gameColor}60`, flexShrink: 0, opacity: e.archived ? 0.55 : 1 }} />
                        ))}
                        {uniqueGames.length > 3 && (
                          <span style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.2 }}>+{uniqueGames.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            {state.games.length > 0 && (
              <div style={{ padding: "12px 16px 8px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[...state.games]
                  .sort((a, b) => {
                    if (a.archived !== b.archived) return a.archived ? 1 : -1;
                    return a.priority - b.priority;
                  })
                  .map(g => (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 5, opacity: g.archived ? 0.55 : 1 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, boxShadow: g.archived ? "none" : `0 0 4px ${g.color}60`, border: g.archived ? `1px dashed ${g.color}` : "none" }} />
                      <span style={{ fontSize: 12, color: t.textSecondary, fontFamily: "DM Mono, monospace", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.archived && "✓ "}{g.title}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Day detail panel */}
            {selectedDay && (
              <DayDetail
                dateStr={selectedDay}
                entries={(dayMap[selectedDay] ?? []) as DayEntryItem[]}
                schedule={state.schedule}
                dayOverrides={state.dayOverrides}
                gameDayOverrides={state.gameDayOverrides}
                activeGames={activeGamesSorted}
                onUpdateDayOverride={onUpdateDayOverride}
                onUpdateGameDayOverride={onUpdateGameDayOverride}
                t={t}
              />
            )}

            {state.games.length === 0 && (
              <div style={{ textAlign: "center", color: t.textMuted, padding: "32px 16px", fontSize: 14, fontFamily: "DM Mono, monospace" }}>
                Add games in the Library tab to see your schedule
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type DayEntryItem = { gameId: string; gameTitle: string; gameColor: string; hours: number; archived: boolean };

function DayDetail({ dateStr, entries, schedule, dayOverrides, gameDayOverrides, activeGames, onUpdateDayOverride, onUpdateGameDayOverride, t }: {
  dateStr: string;
  entries: DayEntryItem[];
  schedule: AppState["schedule"];
  dayOverrides: Record<string, number>;
  gameDayOverrides: Record<string, Record<string, number>>;
  activeGames: ScheduledGame[];
  onUpdateDayOverride: (date: string, hours: number | null) => void;
  onUpdateGameDayOverride: (date: string, gameId: string, hours: number | null) => void;
  t: ReturnType<typeof useTheme>["theme"];
}) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const scheduleHours = schedule[dow];
  const override = dayOverrides[dateStr];
  const effectiveHours = override !== undefined ? override : scheduleHours;
  const formattedDate = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const gameOverrides = gameDayOverrides[dateStr] ?? {};
  const hoursOnDay = new Map(entries.map(e => [e.gameId, e.hours] as const));
  const scheduledGames = activeGames.filter(g => (hoursOnDay.get(g.id) ?? 0) > 0 || g.id in gameOverrides);
  const otherGames = activeGames.filter(g => !scheduledGames.includes(g));

  return (
    <div style={{
      margin: "8px 8px 16px",
      background: t.bgSurface, border: `1px solid ${t.accentBorder}`,
      clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
      overflow: "hidden",
    }}>
      <div style={{ height: 2, background: `linear-gradient(to right, ${t.accent}, transparent)` }} />
      <div style={{ padding: "10px 14px" }}>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: t.textPrimary, marginBottom: 2 }}>
          {formattedDate}
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>
          {Math.round(effectiveHours * 100) / 100}h capacity {override !== undefined ? <span style={{ color: t.accent }}>(override)</span> : ""}
        </div>

        {/* Archived games (read-only) */}
        {entries.filter(e => e.archived).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {entries.filter(e => e.archived).map(e => (
              <div key={e.gameId} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: e.gameColor, flexShrink: 0, border: `1px dashed ${e.gameColor}` }} />
                <div style={{ flex: 1, fontFamily: "DM Mono, monospace", fontSize: 12, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: t.success, marginRight: 4 }}>✓</span>{e.gameTitle}
                </div>
                <div style={{ fontSize: 12, color: e.gameColor, flexShrink: 0 }}>{formatHours(e.hours)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Capacity override */}
        <div style={{ borderTop: `1px solid ${t.borderSubtle}`, paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Override Capacity</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => onUpdateDayOverride(dateStr, Math.max(0, parseFloat(((override ?? scheduleHours) - 0.5).toFixed(1))))}
              style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 30, height: 30, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <div style={{ flex: 1, textAlign: "center", fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 700, color: t.accent }}>
              {Math.round(effectiveHours * 100) / 100}h
            </div>
            <button onClick={() => onUpdateDayOverride(dateStr, parseFloat(((override ?? scheduleHours) + 0.5).toFixed(1)))}
              style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 30, height: 30, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            {override !== undefined && (
              <button onClick={() => onUpdateDayOverride(dateStr, null)}
                style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textSecondary, cursor: "pointer", padding: "4px 8px", fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Per-game overrides */}
        <div style={{ marginTop: 12, borderTop: `1px solid ${t.borderSubtle}`, paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Game Hours</div>
          {scheduledGames.length === 0 ? (
            <div style={{ fontSize: 12, color: t.textMuted, fontFamily: "DM Mono, monospace" }}>No games scheduled</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {scheduledGames.map(g => {
                const ov = gameOverrides[g.id];
                const hasOv = ov !== undefined;
                const current = hasOv ? ov : (hoursOnDay.get(g.id) ?? 0);
                return (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: g.color, boxShadow: `0 0 5px ${g.color}60`, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontFamily: "DM Mono, monospace", fontSize: 12, color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {g.title}
                    </div>
                    <button onClick={() => onUpdateGameDayOverride(dateStr, g.id, Math.max(0, parseFloat((current - 0.5).toFixed(1))))}
                      style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>−</button>
                    <div style={{
                      minWidth: 48, textAlign: "center", fontSize: 12, fontFamily: "DM Mono, monospace",
                      color: hasOv ? g.color : t.textSecondary, fontWeight: hasOv ? 600 : 400,
                    }}>
                      {Math.round(current * 100) / 100}h{hasOv ? " ✦" : ""}
                    </div>
                    <button onClick={() => onUpdateGameDayOverride(dateStr, g.id, parseFloat((current + 0.5).toFixed(1)))}
                      style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 26, height: 26, cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>+</button>
                    {hasOv && (
                      <button onClick={() => onUpdateGameDayOverride(dateStr, g.id, null)}
                        title="Reset to scheduled"
                        style={{ background: "transparent", border: `1px solid ${t.borderSubtle}`, color: t.textMuted, cursor: "pointer", padding: "2px 6px", fontSize: 12, fontFamily: "DM Mono, monospace", flexShrink: 0 }}>↻</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {otherGames.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: t.textMuted, fontFamily: "DM Mono, monospace", padding: "4px 0", listStyle: "none" }}>
                + Pin another game
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {otherGames.map(g => (
                  <button key={g.id}
                    onClick={() => onUpdateGameDayOverride(dateStr, g.id, 1)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "transparent", border: `1px solid ${t.borderSubtle}`, color: t.textSecondary,
                      cursor: "pointer", padding: "6px 8px",
                      fontSize: 12, fontFamily: "DM Mono, monospace", textAlign: "left",
                    }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, opacity: 0.7, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>
                    <span style={{ color: t.accent, fontSize: 12 }}>+ pin 1h</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Week View ─────────────────────────────────────────────────────────
function MobileWeekView({ weekStart, dayMap, schedule, dayOverrides, gameDayOverrides, activeGames, onUpdateDayOverride, onUpdateGameDayOverride, selectedDay, onSelectDay, t }: {
  weekStart: Date;
  dayMap: Record<string, DayEntryItem[]>;
  schedule: AppState["schedule"];
  dayOverrides: Record<string, number>;
  gameDayOverrides: Record<string, Record<string, number>>;
  activeGames: ScheduledGame[];
  onUpdateDayOverride: (date: string, hours: number | null) => void;
  onUpdateGameDayOverride: (date: string, gameId: string, hours: number | null) => void;
  selectedDay: string | null;
  onSelectDay: (date: string | null) => void;
  t: ReturnType<typeof useTheme>["theme"];
}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px" }}>
      {weekDays.map(day => {
        const dateStr = toDateStr(day);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDay;
        const dow = day.getDay();
        const entries = dayMap[dateStr] ?? [];
        const hasOverride = dayOverrides[dateStr] !== undefined;
        const capacity = hasOverride ? dayOverrides[dateStr] : (schedule[dow] ?? 0);
        const totalHoursUsed = entries.reduce((s, e) => s + e.hours, 0);
        const utilizationPct = capacity > 0 ? Math.min(100, (totalHoursUsed / capacity) * 100) : 0;
        const uniqueGames = entries.filter((e, idx, arr) => arr.findIndex(x => x.gameId === e.gameId) === idx);

        return (
          <div key={dateStr}>
            <button
              onClick={() => onSelectDay(isSelected ? null : dateStr)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: isSelected ? t.accentBg : isToday ? `${t.accent}15` : t.bgSurface,
                border: isSelected ? `1px solid ${t.accent}` : isToday ? `1px solid ${t.accent}60` : `1px solid ${t.border}`,
                cursor: "pointer",
                clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
              }}
            >
              {/* Day label */}
              <div style={{ width: 44, flexShrink: 0, textAlign: "left" }}>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: isToday ? t.accentText : t.textMuted, textTransform: "uppercase" }}>
                  {DAY_NAMES[dow]}
                </div>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: isToday ? t.accentText : t.textPrimary }}>
                  {day.getDate()}
                </div>
              </div>

              {/* Capacity bar + game list */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {capacity > 0 && (
                  <div style={{ height: 2, background: t.borderSubtle, marginBottom: 5, overflow: "hidden", outline: hasOverride ? `1px solid ${t.accentBorder}` : "none", outlineOffset: 1 }}>
                    <div style={{ height: "100%", width: `${utilizationPct}%`, background: utilizationPct > 90 ? t.danger : t.accent, transition: "width 0.3s" }} />
                  </div>
                )}
                {uniqueGames.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {uniqueGames.slice(0, 4).map(e => (
                      <div key={e.gameId} style={{ display: "flex", alignItems: "center", gap: 4, opacity: e.archived ? 0.55 : 1 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: e.gameColor, boxShadow: e.archived ? "none" : `0 0 3px ${e.gameColor}60`, flexShrink: 0, border: e.archived ? `1px dashed ${e.gameColor}` : "none" }} />
                        <span style={{ fontSize: 11, color: t.textSecondary, fontFamily: "DM Mono, monospace" }}>
                          {formatHours(e.hours)}
                        </span>
                      </div>
                    ))}
                    {uniqueGames.length > 4 && <span style={{ fontSize: 11, color: t.textMuted }}>+{uniqueGames.length - 4}</span>}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: t.textDisabled, fontFamily: "DM Mono, monospace" }}>
                    {capacity > 0 ? "no games" : "rest"}
                  </span>
                )}
              </div>

              {/* Capacity label */}
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                {capacity > 0 ? (
                  <span style={{ fontSize: 12, color: hasOverride ? t.accent : t.textMuted, fontFamily: "DM Mono, monospace" }}>
                    {Math.round(totalHoursUsed * 10) / 10}/{capacity}h{hasOverride ? " ✦" : ""}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: t.textMuted }}>—</span>
                )}
              </div>
            </button>

            {isSelected && (
              <DayDetail
                dateStr={dateStr}
                entries={entries}
                schedule={schedule}
                dayOverrides={dayOverrides}
                gameDayOverrides={gameDayOverrides}
                activeGames={activeGames}
                onUpdateDayOverride={onUpdateDayOverride}
                onUpdateGameDayOverride={onUpdateGameDayOverride}
                t={t}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ state, user, syncStatus, onUpdateState, onAuth, onLogout }: {
  state: AppState; user: User | null;
  syncStatus: "idle" | "saving" | "saved" | "error";
  onUpdateState: (p: Partial<AppState>) => void;
  onAuth: (u: User) => void;
  onLogout: () => void;
}) {
  const { theme: t } = useTheme();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <MobileHeader title="Settings" t={t} />
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Account */}
        <Section title="Account" t={t}>
          {user ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2 }}>Signed in as</div>
                  <div style={{ fontSize: 14, color: t.textPrimary, fontFamily: "DM Mono, monospace" }}>{user.email}</div>
                </div>
                {syncStatus !== "idle" && (
                  <span style={{ fontSize: 12, color: syncStatus === "saved" ? t.success : syncStatus === "error" ? t.danger : t.textMuted }}>
                    {syncStatus === "saving" ? "saving…" : syncStatus === "saved" ? "✓ synced" : "sync error"}
                  </span>
                )}
              </div>
              <button onClick={onLogout} style={{
                background: "transparent", border: `1px solid ${t.danger}50`,
                color: t.danger, cursor: "pointer", padding: "8px 14px",
                fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", alignSelf: "flex-start",
              }}>Sign Out</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>Sign in to sync your schedule across devices.</div>
              <button onClick={() => setShowAuth(true)} style={{
                background: t.accentBg, border: `1px solid ${t.accentBorder}`,
                color: t.accentText, cursor: "pointer", padding: "10px 16px",
                fontSize: 14, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
                clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
                boxShadow: t.accentGlow !== "none" ? t.accentGlow : "none",
              }}>Save / Sign In</button>
            </div>
          )}
        </Section>

        {/* Theme */}
        <Section title="Theme" t={t}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThemePicker fixed />
            <span style={{ fontSize: 12, color: t.textMuted }}>Tap to change theme</span>
          </div>
        </Section>

        {/* Schedule */}
        <Section title="Daily Schedule" t={t}>
          <ScheduleConfig schedule={state.schedule} onUpdate={(schedule) => onUpdateState({ schedule })} fixed />
        </Section>

        {/* Scheduling mode */}
        <Section title="Scheduling Mode" t={t}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(["priority", "split"] as SchedulingMode[]).map(m => {
              const active = state.schedulingMode === m;
              return (
                <button key={m} onClick={() => onUpdateState({ schedulingMode: m })} style={{
                  padding: "10px 14px",
                  background: active ? t.accentBg : "transparent",
                  border: `1px solid ${active ? t.accent : t.border}`,
                  color: active ? t.accentText : t.textSecondary,
                  cursor: "pointer", textAlign: "left",
                  clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
                }}>
                  <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
                    {m === "priority" ? "Priority" : "Split"}
                  </div>
                  <div style={{ fontSize: 12, color: active ? t.accentText : t.textMuted, opacity: active ? 0.8 : 1 }}>
                    {m === "priority" ? "P1 plays to completion before others start" : "Active games share daily hours equally"}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={(u) => { onAuth(u); setShowAuth(false); }} />}
    </div>
  );
}

function Section({ title, t, children }: { title: string; t: ReturnType<typeof useTheme>["theme"]; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: t.textMuted, marginBottom: 10, borderBottom: `1px solid ${t.border}`, paddingBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Main Mobile Layout ────────────────────────────────────────────────────────
export function MobileLayout({
  state, user, syncStatus,
  onUpdateState, onAddGame, onRemoveGame, onArchiveGame, onUnarchiveGame, onUpdateGame,
  onReorderGames, onUpdateDayOverride, onUpdateGameDayOverride, onAuth, onLogout,
}: Props) {
  const { theme: t } = useTheme();
  const [activeTab, setActiveTab] = useState<MobileTab>("games");

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "95vh", width: "100vw",
      background: t.bgVoid, color: t.textPrimary,
      fontFamily: "DM Mono, monospace",
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeTab === "games" && (
          <GamesTab state={state} onAdd={onAddGame} onRemove={onRemoveGame} onArchive={onArchiveGame} onUnarchive={onUnarchiveGame} onUpdateGame={onUpdateGame} />
        )}
        {activeTab === "calendar" && (
          <CalendarTab state={state} onUpdateState={onUpdateState} onUpdateDayOverride={onUpdateDayOverride} onUpdateGameDayOverride={onUpdateGameDayOverride} />
        )}
        {activeTab === "settings" && (
          <SettingsTab state={state} user={user} syncStatus={syncStatus} onUpdateState={onUpdateState} onAuth={onAuth} onLogout={onLogout} />
        )}
      </div>
      <TabBar active={activeTab} onChange={setActiveTab} t={t} />
    </div>
  );
}