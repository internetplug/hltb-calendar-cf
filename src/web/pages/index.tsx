import { useState, useCallback, useEffect, useRef } from "react";
import { loadState, saveState, AppState, ScheduledGame, computeAllGameDays, getTotalHours, todayLocal, freezePastSchedule, freezePastGameDays } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { ScheduleConfig } from "@/components/ScheduleConfig";
import { MonthView } from "@/components/MonthView";
import { WeekView } from "@/components/WeekView";
import { AuthModal } from "@/components/AuthModal";
import { AccountModal } from "@/components/AccountModal";
import { ThemePicker } from "@/components/ThemePicker";
import { MobileLayout } from "@/components/MobileLayout";
import { useIsMobile } from "@/hooks/use-mobile";

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface User { id: string; email: string; username?: string | null; }

export default function App() {
  const { theme: t } = useTheme();
  const [state, setState] = useState<AppState>(() => loadState());
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error" | "load-error">("idle");
  // Block autosave until the cloud state has loaded, so a slow or failed load
  // can't be overwritten by an autosave of stale local state.
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCloudState = useCallback(() => {
    fetch("/api/calendar/load", { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error("load failed");
        return r.json() as Promise<{ state: AppState | null }>;
      })
      .then(({ state: cloudState }) => {
        if (cloudState) setState({ ...loadState(), ...cloudState });
        setCloudLoaded(true);
      })
      .catch(() => setSyncStatus("load-error"));
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json() as Promise<{ user: User | null }>)
      .then(({ user }) => {
        if (user) {
          setUser(user);
          loadCloudState();
        }
      }).catch(() => {});
  }, [loadCloudState]);

  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
    if (!user || !cloudLoaded) return;
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
  }, [state, user, cloudLoaded]);

  const handleAuth = (u: User) => {
    setUser(u);
    setShowAuth(false);
    loadCloudState();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setCloudLoaded(false);
    setSyncStatus("idle");
  };

  const handleAccountDeleted = () => {
    // Session cookie is already cleared server-side; drop local auth state.
    setShowAccount(false);
    setUser(null);
    setCloudLoaded(false);
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
      const daysMap = computeAllGameDays(s.games, s.schedule, s.dayOverrides, s.gameDayOverrides);
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
    setState(s => {
      // Changing the per-day cap would re-flow this game's past days. Freeze them into
      // gameDayOverrides first so the new cap only affects today and future days.
      const gameDayOverrides = patch.maxHoursPerDay !== undefined
        ? freezePastGameDays(id, s.games, s.schedule, s.dayOverrides, s.gameDayOverrides)
        : s.gameDayOverrides;
      return {
        ...s,
        gameDayOverrides,
        games: s.games.map(g => g.id === id ? { ...g, ...patch } : g),
      };
    });
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
        onUpdateUser={setUser}
        onAccountDeleted={handleAccountDeleted}
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
        onSetLibrarySort={sort => updateState({ librarySort: sort })}
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
                color: syncStatus === "saved" ? t.success : syncStatus === "saving" ? t.textMuted : t.danger,
              }}>
                {syncStatus === "saving" ? "saving…" : syncStatus === "saved" ? "✓ saved" : syncStatus === "load-error" ? "couldn't load saved data — refresh to retry" : "save failed"}
              </div>
            )}

            {/* Auth */}
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setShowAccount(true)}
                  title="Manage account"
                  style={{
                    background: "transparent", border: `1px solid ${t.border}`,
                    color: t.textMuted, cursor: "pointer", padding: "4px 10px",
                    fontSize: 11, fontFamily: "DM Mono, monospace",
                    maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >{user.username || user.email}</button>
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
      {showAccount && user && (
        <AccountModal
          user={user}
          onClose={() => setShowAccount(false)}
          onUpdateUser={setUser}
          onDeleted={handleAccountDeleted}
        />
      )}
    </div>
  );
}
