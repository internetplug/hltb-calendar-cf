import { useState, useCallback, useEffect, useRef } from "react";
import { loadState, saveState, AppState, ScheduledGame, SchedulingMode, computeAllGameDays, getTotalHours, todayLocal, freezePastSchedule } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { ScheduleConfig } from "@/components/ScheduleConfig";
import { MonthView } from "@/components/MonthView";
import { WeekView } from "@/components/WeekView";
import { AuthModal } from "@/components/AuthModal";
import { ThemePicker } from "@/components/ThemePicker";
import { MobileLayout } from "@/components/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface User { id: string; email: string; }

export default function App() {
  const { theme: t } = useTheme();
  const [state, setState] = useState<AppState>(() => loadState());
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json() as Promise<{ user: User | null }>)
      .then(({ user }) => {
        if (user) {
          setUser(user);
          fetch("/api/calendar/load", { credentials: "include" })
            .then(r => r.json() as Promise<{ state: AppState | null }>)
            .then(({ state: cloudState }) => {
              if (cloudState) setState({ ...loadState(), ...cloudState });
            }).catch(() => {});
        }
      }).catch(() => {});
  }, []);

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    if (!user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/calendar/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          credentials: "include",
        });
        setSyncStatus(res.ok ? "saved" : "error");
        if (res.ok) setTimeout(() => setSyncStatus("idle"), 2000);
      } catch { setSyncStatus("error"); }
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, user]);

  const handleAuth = (u: User) => {
    setUser(u);
    setShowAuth(false);
    fetch("/api/calendar/load", { credentials: "include" })
      .then(r => r.json() as Promise<{ state: AppState | null }>)
      .then(({ state: cloudState }) => {
        if (cloudState) setState({ ...loadState(), ...cloudState });
      }).catch(() => {});
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setSyncStatus("idle");
  };

  const currentDate = new Date(state.calendarDate + "T00:00:00");

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState(s => ({ ...s, ...patch }));
  }, []);

  const handleAddGame = useCallback((game: Omit<ScheduledGame, "id">) => {
    setState(s => ({ ...s, games: [...s.games, { ...game, id: genId() }] }));
  }, []);

  const handleRemoveGame = useCallback((id: string) => {
    setState(s => {
      const remaining = s.games.filter(g => g.id !== id);
      const active = remaining.filter(g => !g.archived && !g.inLibrary);
      const library = remaining.filter(g => !g.archived && g.inLibrary);
      const archived = remaining.filter(g => g.archived);
      const renumbered = [...active].sort((a, b) => a.priority - b.priority).map((g, i) => ({ ...g, priority: i + 1 }));
      return { ...s, games: [...renumbered, ...library, ...archived] };
    });
  }, []);

  const handleArchiveGame = useCallback((id: string) => {
    setState(s => {
      const today = todayLocal();
      const daysMap = computeAllGameDays(s.games, s.schedule, s.schedulingMode, s.dayOverrides, s.gameDayOverrides);
      const target = s.games.find(g => g.id === id);
      const past = (daysMap.get(id) ?? [])
        .filter(d => d.date <= today)
        .map(d => ({ date: d.date, hours: d.hours, isStart: d.isStart, isEnd: false }));
      if (past.length > 0) past[past.length - 1].isEnd = true;
      const archivedHoursPlayed = target ? getTotalHours(target) : past.reduce((sum, d) => sum + d.hours, 0);
      const updated = s.games.map(g =>
        g.id === id ? { ...g, archived: true, archivedDays: past, archivedHoursPlayed } : g
      );
      const active = updated.filter(g => !g.archived && !g.inLibrary);
      const library = updated.filter(g => !g.archived && g.inLibrary);
      const archived = updated.filter(g => g.archived);
      const renumbered = [...active].sort((a, b) => a.priority - b.priority).map((g, i) => ({ ...g, priority: i + 1 }));
      return { ...s, games: [...renumbered, ...library, ...archived] };
    });
  }, []);

  const handleUnarchiveGame = useCallback((id: string) => {
    setState(s => {
      const activeCount = s.games.filter(g => !g.archived && !g.inLibrary).length;
      const updated = s.games.map(g =>
        g.id === id ? { ...g, archived: false, archivedDays: [], archivedHoursPlayed: 0, priority: activeCount + 1 } : g
      );
      return { ...s, games: updated };
    });
  }, []);

  // Promote a backlog Library game onto the calendar: schedule it starting today at the end of the priority list.
  const handleActivateGame = useCallback((id: string) => {
    setState(s => {
      const activeCount = s.games.filter(g => !g.archived && !g.inLibrary).length;
      return {
        ...s,
        games: s.games.map(g =>
          g.id === id ? { ...g, inLibrary: false, startDate: todayLocal(), priority: activeCount + 1 } : g
        ),
      };
    });
  }, []);

  // Send an active game back to the Library backlog: unschedules it (off the calendar) while keeping the game.
  const handleMoveToLibrary = useCallback((id: string) => {
    setState(s => {
      const updated = s.games.map(g => g.id === id ? { ...g, inLibrary: true } : g);
      const active = updated.filter(g => !g.archived && !g.inLibrary);
      const library = updated.filter(g => !g.archived && g.inLibrary);
      const archived = updated.filter(g => g.archived);
      const renumbered = [...active].sort((a, b) => a.priority - b.priority).map((g, i) => ({ ...g, priority: i + 1 }));
      return { ...s, games: [...renumbered, ...library, ...archived] };
    });
  }, []);

  const handleUpdateGame = useCallback((id: string, patch: Partial<ScheduledGame>) => {
    setState(s => ({ ...s, games: s.games.map(g => g.id === id ? { ...g, ...patch } : g) }));
  }, []);

  const handleReorderGames = useCallback((games: ScheduledGame[]) => {
    setState(s => ({ ...s, games }));
  }, []);

  const handleUpdateSchedule = useCallback((schedule: AppState["schedule"]) => {
    setState(s => ({
      ...s,
      schedule,
      // Freeze past days so a schedule change only affects today and future days.
      dayOverrides: freezePastSchedule(s.games, s.schedule, schedule, s.dayOverrides),
    }));
  }, []);

  const handleUpdateDayOverride = useCallback((date: string, hours: number | null) => {
    setState(s => {
      const next = { ...s.dayOverrides };
      if (hours === null || hours < 0) {
        delete next[date];
      } else {
        next[date] = hours;
      }
      return { ...s, dayOverrides: next };
    });
  }, []);

  const handleUpdateGameDayOverride = useCallback((date: string, gameId: string, hours: number | null) => {
    setState(s => {
      const next = { ...s.gameDayOverrides };
      const day = { ...(next[date] ?? {}) };
      if (hours === null || hours < 0) {
        delete day[gameId];
      } else {
        day[gameId] = hours;
      }
      if (Object.keys(day).length === 0) {
        delete next[date];
      } else {
        next[date] = day;
      }
      return { ...s, gameDayOverrides: next };
    });
  }, []);

  const handleNavigate = useCallback((d: Date) => {
    updateState({ calendarDate: d.toISOString().split("T")[0] });
  }, [updateState]);

  const isMobile = useIsMobile();

  const views: { key: AppState["calendarView"]; label: string }[] = [
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
  ];

  if (isMobile) {
    return (
      <MobileLayout
        state={state}
        user={user}
        syncStatus={syncStatus}
        onUpdateState={updateState}
        onUpdateSchedule={handleUpdateSchedule}
        onAddGame={handleAddGame}
        onRemoveGame={handleRemoveGame}
        onArchiveGame={handleArchiveGame}
        onUnarchiveGame={handleUnarchiveGame}
        onActivateGame={handleActivateGame}
        onMoveToLibraryGame={handleMoveToLibrary}
        onUpdateGame={handleUpdateGame}
        onReorderGames={handleReorderGames}
        onUpdateDayOverride={handleUpdateDayOverride}
        onUpdateGameDayOverride={handleUpdateGameDayOverride}
        onAuth={handleAuth}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw",
      overflow: "hidden",
      background: t.bgVoid,
      color: t.textPrimary,
      fontFamily: "DM Mono, monospace",
    }}>
      <Sidebar
        state={state}
        onAdd={handleAddGame}
        onRemove={handleRemoveGame}
        onArchive={handleArchiveGame}
        onUnarchive={handleUnarchiveGame}
        onActivate={handleActivateGame}
        onToLibrary={handleMoveToLibrary}
        onUpdateGame={handleUpdateGame}
        onReorderGames={handleReorderGames}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", height: 52,
          borderBottom: `1px solid ${t.border}`,
          background: t.bgBase,
          flexShrink: 0,
        }}>
          {/* View switcher */}
          <div style={{ display: "flex", gap: 3 }}>
            {views.map(v => {
              const active = state.calendarView === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => {
                    const patch: Partial<AppState> = { calendarView: v.key };
                    if (v.key === "week") patch.calendarDate = todayLocal();
                    updateState(patch);
                  }}
                  style={{
                    padding: "6px 16px",
                    background: active ? t.accentBg : "transparent",
                    border: `1px solid ${active ? t.accent : t.border}`,
                    color: active ? t.accentText : t.textSecondary,
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "Rajdhani, sans-serif",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)",
                    transition: "all 0.15s",
                    boxShadow: active && t.accentGlow !== "none" ? t.accentGlow : "none",
                  }}
                >{v.label}</button>
              );
            })}
          </div>

          {/* Right side */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Sync status */}
            {user && syncStatus !== "idle" && (
              <div style={{
                fontSize: 11, fontFamily: "DM Mono, monospace",
                color: syncStatus === "saved" ? t.success : syncStatus === "error" ? t.danger : t.textMuted,
              }}>
                {syncStatus === "saving" ? "saving…" : syncStatus === "saved" ? "✓ saved" : "save failed"}
              </div>
            )}

            {/* Auth */}
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, color: t.textMuted, fontFamily: "DM Mono, monospace", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    background: "transparent", border: `1px solid ${t.border}`,
                    color: t.textSecondary, cursor: "pointer", padding: "4px 10px",
                    fontSize: 11, fontFamily: "Rajdhani, sans-serif", fontWeight: 600,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                  }}
                >Sign Out</button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{
                  background: t.accentBg, border: `1px solid ${t.accentBorder}`,
                  color: t.accentText, cursor: "pointer", padding: "5px 14px",
                  fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  clipPath: "polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 0 100%)",
                  boxShadow: t.accentGlow !== "none" ? t.accentGlow : "none",
                }}
              >Save / Sign In</button>
            )}

            {/* Scheduling mode toggle */}
            <div style={{ display: "flex", border: `1px solid ${t.border}`, overflow: "hidden" }}>
              {(["priority", "split"] as SchedulingMode[]).map((m, i) => {
                const active = state.schedulingMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => updateState({ schedulingMode: m })}
                    title={m === "priority" ? "Priority mode: P1 plays first, others wait" : "Split mode: active games share daily hours equally"}
                    style={{
                      padding: "5px 12px",
                      background: active ? t.accentBg : "transparent",
                      border: "none",
                      borderRight: i === 0 ? `1px solid ${t.border}` : "none",
                      color: active ? t.accentText : t.textSecondary,
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "Rajdhani, sans-serif",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      transition: "all 0.15s",
                      display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{m === "priority" ? "▶▶" : "⇌"}</span>
                    {m === "priority" ? "Priority" : "Split"}
                  </button>
                );
              })}
            </div>

            <ScheduleConfig schedule={state.schedule} onUpdate={handleUpdateSchedule} />
            <ThemePicker />
          </div>
        </div>

        {/* Calendar */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {state.calendarView === "month" && <MonthView state={state} currentDate={currentDate} onNavigate={handleNavigate} dayOverrides={state.dayOverrides} onUpdateDayOverride={handleUpdateDayOverride} onUpdateGameDayOverride={handleUpdateGameDayOverride} />}
          {state.calendarView === "week" && <WeekView state={state} currentDate={currentDate} onNavigate={handleNavigate} dayOverrides={state.dayOverrides} onUpdateDayOverride={handleUpdateDayOverride} onUpdateGameDayOverride={handleUpdateGameDayOverride} />}
        </div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuth={handleAuth} />}
    </div>
  );
}
