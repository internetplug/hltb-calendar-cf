// LocalStorage-backed store for HowLongToBeat calendar

export type CompletionType = "main" | "main_sides" | "completionist" | "average" | "custom";

export interface HLTBData {
  main: number | null;
  main_sides: number | null;
  completionist: number | null;
  average: number | null;
  imageUrl: string | null;
  platforms: string[];
  developer?: string | null;
  publisher?: string | null;
  genres?: string[];
  url?: string;
  releaseYear?: number | null;
}

export interface ScheduledGame {
  id: string;
  hltbId: string;
  title: string;
  imageUrl: string | null;
  hltb: HLTBData;
  completionType: CompletionType;
  customHours: number | null;    // used when completionType === "custom"
  progressPercent: number;       // 0–100: how far through the game already (in-progress)
  startDate: string;             // ISO date YYYY-MM-DD
  color: string;
  platforms: string[];
  priority: number;
  minHoursPerDay: number;
  maxHoursPerDay: number;        // 0 = unlimited
  completionOverride: string | null;  // ISO date YYYY-MM-DD to mark complete on specific date, or null for calculated
  inLibrary: boolean;            // true = sitting in the backlog Library, not scheduled on the calendar
  archived: boolean;
  archivedDays: { date: string; hours: number; isStart: boolean; isEnd: boolean }[];
  archivedHoursPlayed: number;   // snapshot of total hours played at the moment of archive
}

export interface DaySchedule {
  [day: number]: number;
}

export interface AppState {
  games: ScheduledGame[];
  schedule: DaySchedule;
  dayOverrides: Record<string, number>; // YYYY-MM-DD → hours override
  gameDayOverrides: Record<string, Record<string, number>>; // YYYY-MM-DD → gameId → hours pin
  calendarView: "month" | "week";
  calendarDate: string;
  librarySort: LibrarySort;
}

export type LibrarySort =
  | "custom"
  | "alpha"
  | "time_main"
  | "time_main_sides"
  | "time_completionist"
  | "time_average"
  | "release";

export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  custom:              "Custom",
  alpha:               "Alphabetical",
  time_main:           "Time: Main Story",
  time_main_sides:     "Time: Main + Sides",
  time_completionist:  "Time: Completionist",
  time_average:        "Time: Average",
  release:             "Release Date",
};

/**
 * Sort Library (backlog) games for display. "custom" keeps the stored array
 * order (user-arranged via drag). Time sorts are shortest-first and fall back
 * to the game's custom hours when the HLTB field is missing; games with no
 * value for the chosen key sort last, ties break alphabetically.
 */
export function sortLibraryGames(games: ScheduledGame[], sort: LibrarySort): ScheduledGame[] {
  if (sort === "custom") return games;
  const byValue = (get: (g: ScheduledGame) => number | null | undefined) =>
    (a: ScheduledGame, b: ScheduledGame) => {
      const av = get(a) ?? null;
      const bv = get(b) ?? null;
      if (av === null && bv === null) return a.title.localeCompare(b.title);
      if (av === null) return 1;
      if (bv === null) return -1;
      return av - bv || a.title.localeCompare(b.title);
    };
  const timeOrCustom = (h: number | null | undefined, g: ScheduledGame) =>
    h ?? (g.completionType === "custom" ? g.customHours : null);
  const sorted = [...games];
  switch (sort) {
    case "alpha":               return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "time_main":           return sorted.sort(byValue(g => timeOrCustom(g.hltb.main, g)));
    case "time_main_sides":     return sorted.sort(byValue(g => timeOrCustom(g.hltb.main_sides, g)));
    case "time_completionist":  return sorted.sort(byValue(g => timeOrCustom(g.hltb.completionist, g)));
    case "time_average":        return sorted.sort(byValue(g => timeOrCustom(g.hltb.average, g)));
    case "release":             return sorted.sort(byValue(g => g.hltb.releaseYear));
  }
}

const STORAGE_KEY = "hltb_calendar_v1";

const DEFAULT_SCHEDULE: DaySchedule = {
  0: 3, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 3,
};

const DEFAULT_STATE: AppState = {
  games: [],
  schedule: DEFAULT_SCHEDULE,
  dayOverrides: {},
  gameDayOverrides: {},
  calendarView: "month",
  calendarDate: todayLocal(),
  librarySort: "custom",
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    if (parsed.games) {
      parsed.games = parsed.games.map((g: ScheduledGame, i: number) => ({
        ...g,
        priority: g.priority !== undefined ? g.priority : i + 1,
        minHoursPerDay: g.minHoursPerDay !== undefined ? g.minHoursPerDay : 0,
        maxHoursPerDay: g.maxHoursPerDay !== undefined ? g.maxHoursPerDay : 0,
        customHours: g.customHours !== undefined ? g.customHours : null,
        progressPercent: g.progressPercent !== undefined ? g.progressPercent : 0,
        completionOverride: g.completionOverride !== undefined ? g.completionOverride : null,
        inLibrary: g.inLibrary ?? false,
        archived: g.archived ?? false,
        archivedDays: g.archivedDays ?? [],
        archivedHoursPlayed: g.archivedHoursPlayed ?? (g.archivedDays ?? []).reduce((s: number, d: { hours: number }) => s + d.hours, 0),
      }));
    }
    return { ...DEFAULT_STATE, dayOverrides: {}, gameDayOverrides: {}, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: AppState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// Color palette
export const GAME_COLORS = [
  "#00e5ff", "#00cc88", "#ffaa00", "#ff6644",
  "#aa44ff", "#ff4488", "#44aaff", "#88ff44",
  "#ff8800", "#00ffaa",
];

export function nextGameColor(existingColors: string[]): string {
  const unused = GAME_COLORS.filter(c => !existingColors.includes(c));
  if (unused.length > 0) return unused[0];
  return GAME_COLORS[existingColors.length % GAME_COLORS.length];
}

/** Total hours based on completion type (before progress deduction) */
export function getTotalHours(game: ScheduledGame): number {
  if (game.completionType === "custom") return game.customHours ?? 0;
  const h = game.hltb[game.completionType];
  return h ?? game.hltb.main ?? 0;
}

/** Remaining hours after accounting for in-progress percentage */
export function getGameHours(game: ScheduledGame): number {
  const total = getTotalHours(game);
  const done  = (game.progressPercent ?? 0) / 100;
  return Math.max(0, total * (1 - done));
}

export interface GameDayEntry {
  date: string;
  hours: number;
  isStart: boolean;
  isEnd: boolean;
  progress: number; // 0–1 of remaining hours done at start of this day
}

export function computeAllGameDays(
  games: ScheduledGame[],
  schedule: DaySchedule,
  dayOverrides: Record<string, number> = {},
  gameDayOverrides: Record<string, Record<string, number>> = {}
): Map<string, GameDayEntry[]> {
  if (games.length === 0) return new Map();

  const active = games.filter(g => !g.archived && !g.inLibrary);
  const archivedGames = games.filter(g => g.archived);
  const sorted = [...active].sort((a, b) => a.priority - b.priority);

  const remaining = new Map<string, number>(sorted.map(g => [g.id, getGameHours(g)]));
  const logged    = new Map<string, number>(sorted.map(g => [g.id, 0]));
  const result    = new Map<string, GameDayEntry[]>(sorted.map(g => [g.id, []]));

  if (sorted.length === 0) {
    for (const game of archivedGames) {
      result.set(game.id, materializeArchivedDays(game));
    }
    return result;
  }

  const startDates  = sorted.map(g => new Date(g.startDate + "T00:00:00"));
  const globalStart = startDates.reduce((a, b) => (a < b ? a : b));

  const maxHours = sorted.reduce((s, g) => s + getGameHours(g), 0);
  const avgDaily = Object.values(schedule).reduce((a, b) => a + b, 0) / 7 || 1;
  const maxDays  = Math.ceil((maxHours / avgDaily) * 2) + 365;

  // Hours already consumed by archived games per date — kept "spent" so live games
  // don't backfill into the slot and shift end dates after an archive.
  const archivedHoursByDate = new Map<string, number>();
  for (const g of archivedGames) {
    for (const d of g.archivedDays) {
      archivedHoursByDate.set(d.date, (archivedHoursByDate.get(d.date) ?? 0) + d.hours);
    }
  }

  const current = new Date(globalStart);

  for (let day = 0; day < maxDays; day++) {
    const dateStr   = current.toISOString().split("T")[0];
    const dow       = current.getDay();
    const archivedUsed = archivedHoursByDate.get(dateStr) ?? 0;
    let dayBudget   = Math.max(0, (dayOverrides[dateStr] ?? schedule[dow] ?? 0) - archivedUsed);

    // Per-game pins for this date: { gameId: hours }. Applied before normal allocation,
    // exact hours honored (bypasses maxHoursPerDay cap and startDate), clamped to remaining.
    const gameOverridesToday = gameDayOverrides[dateStr] ?? {};
    const overriddenIds = new Set<string>();
    for (const game of sorted) {
      if (!(game.id in gameOverridesToday)) continue;
      overriddenIds.add(game.id);
      const ov = gameOverridesToday[game.id];
      const rem = remaining.get(game.id) ?? 0;
      const hoursThisDay = Math.max(0, Math.min(ov, rem));
      if (hoursThisDay <= 0) continue;
      const total       = getGameHours(game);
      const loggedSoFar = logged.get(game.id) ?? 0;
      result.get(game.id)!.push({
        date: dateStr, hours: hoursThisDay,
        isStart: result.get(game.id)!.length === 0, isEnd: false,
        progress: total > 0 ? loggedSoFar / total : 0,
      });
      dayBudget = Math.max(0, dayBudget - hoursThisDay);
      remaining.set(game.id, rem - hoursThisDay);
      logged.set(game.id, loggedSoFar + hoursThisDay);
    }

    if (dayBudget > 0) {
      for (const game of sorted) {
        if (dayBudget <= 0) break;
        if (overriddenIds.has(game.id)) continue;
        if (current < new Date(game.startDate + "T00:00:00")) continue;
        const rem = remaining.get(game.id) ?? 0;
        if (rem <= 0) continue;
        const total        = getGameHours(game);
        const loggedSoFar  = logged.get(game.id) ?? 0;
        const dayCap       = game.maxHoursPerDay > 0 ? game.maxHoursPerDay : Infinity;
        const hoursThisDay = Math.min(dayBudget, rem, dayCap);
        if (hoursThisDay <= 0) continue;
        result.get(game.id)!.push({
          date: dateStr, hours: hoursThisDay,
          isStart: result.get(game.id)!.length === 0, isEnd: false,
          progress: total > 0 ? loggedSoFar / total : 0,
        });
        dayBudget -= hoursThisDay;
        remaining.set(game.id, rem - hoursThisDay);
        logged.set(game.id, loggedSoFar + hoursThisDay);
      }
    }

    if (sorted.every(g => (remaining.get(g.id) ?? 0) <= 0.0001)) break;
    current.setDate(current.getDate() + 1);
  }

  for (const game of sorted) {
    const entries = result.get(game.id)!;
    if (entries.length === 0) continue;
    
    if (game.completionOverride) {
      // Find the entry on or closest to the override date
      const overrideDate = game.completionOverride;
      const idx = entries.findIndex(e => e.date === overrideDate);
      if (idx !== -1) {
        // Override date has scheduled hours; mark it as end
        entries[idx].isEnd = true;
        // Remove any entries after the override date
        entries.splice(idx + 1);
      } else {
        // Override date is not on the schedule; add a synthetic end entry
        entries.push({
          date: overrideDate,
          hours: 0,
          isStart: false,
          isEnd: true,
          progress: 1,
        });
      }
    } else {
      // Normal behavior: mark last entry as end
      entries[entries.length - 1].isEnd = true;
    }
  }

  for (const game of archivedGames) {
    result.set(game.id, materializeArchivedDays(game));
  }

  return result;
}

function materializeArchivedDays(game: ScheduledGame): GameDayEntry[] {
  const arr = game.archivedDays;
  return arr.map((d, i) => ({
    date: d.date,
    hours: d.hours,
    isStart: d.isStart,
    isEnd: d.isEnd,
    progress: arr.length > 1 ? i / (arr.length - 1) : 1,
  }));
}

export function computeGameDays(
  game: ScheduledGame,
  schedule: DaySchedule,
  allGames: ScheduledGame[],
  dayOverrides: Record<string, number> = {},
  gameDayOverrides: Record<string, Record<string, number>> = {}
): GameDayEntry[] {
  return computeAllGameDays(allGames, schedule, dayOverrides, gameDayOverrides).get(game.id) ?? [];
}

/**
 * Editing the weekly `schedule` would otherwise re-flow *past* days, since each day
 * falls back to `schedule[dow]` when it has no explicit override. To keep history
 * stable, freeze every affected past date's *old* capacity into `dayOverrides` so that
 * only today and future days pick up the new schedule.
 *
 * Returns the next `dayOverrides` map. Past dates that already have an explicit override,
 * or whose day-of-week hours didn't change, are left untouched.
 */
export function freezePastSchedule(
  games: ScheduledGame[],
  oldSchedule: DaySchedule,
  newSchedule: DaySchedule,
  dayOverrides: Record<string, number>
): Record<string, number> {
  const dates = games.flatMap(g => [g.startDate, ...(g.archivedDays ?? []).map(d => d.date)]).filter(Boolean);
  if (dates.length === 0) return dayOverrides;
  const earliest = dates.reduce((a, b) => (a < b ? a : b));

  const next = { ...dayOverrides };
  const current = new Date(earliest + "T00:00:00");
  const todayDate = new Date(todayLocal() + "T00:00:00");
  while (current < todayDate) {
    const dateStr = current.toISOString().split("T")[0];
    const dow = current.getDay();
    if (!(dateStr in next) && (oldSchedule[dow] ?? 0) !== (newSchedule[dow] ?? 0)) {
      next[dateStr] = oldSchedule[dow] ?? 0;
    }
    current.setDate(current.getDate() + 1);
  }
  return next;
}

/**
 * Editing a game's per-day cap (`maxHoursPerDay`) would otherwise re-flow that game's
 * *past* days, since `computeAllGameDays` recomputes the whole timeline from the global
 * start. To keep history stable, pin every past day the game is scheduled on into
 * `gameDayOverrides` at its current hours — those pins are honored exactly and bypass the
 * cap — so only today and future days pick up the new cap.
 *
 * Returns the next `gameDayOverrides` map. Past days that already have an explicit pin for
 * this game are left untouched.
 */
export function freezePastGameDays(
  gameId: string,
  games: ScheduledGame[],
  schedule: DaySchedule,
  dayOverrides: Record<string, number> = {},
  gameDayOverrides: Record<string, Record<string, number>> = {}
): Record<string, Record<string, number>> {
  const today = todayLocal();
  const days = computeAllGameDays(games, schedule, dayOverrides, gameDayOverrides).get(gameId) ?? [];

  const next = { ...gameDayOverrides };
  for (const d of days) {
    if (d.date >= today) break; // entries are chronological — nothing left to freeze
    if (d.hours <= 0) continue;
    const existing = next[d.date] ?? {};
    if (gameId in existing) continue;
    next[d.date] = { ...existing, [gameId]: d.hours };
  }
  return next;
}

export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins  = Math.round((h - whole) * 60);
  return mins === 0 ? `${whole}h` : `${whole}h ${mins}m`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

/** Format a span of calendar days as "Xw Yd" so duration reads the same at any length. */
export function formatWeeksDays(totalDays: number): string {
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  if (weeks === 0) return `${days}d`;
  if (days === 0) return `${weeks}w`;
  return `${weeks}w ${days}d`;
}

/** YYYY-MM-DD for the user's local "today" (not UTC). */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DAY_NAMES      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const DAY_NAMES_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export const COMPLETION_LABELS: Record<CompletionType, string> = {
  main:          "Main Story",
  main_sides:    "Main + Sides",
  completionist: "Completionist",
  average:       "Average",
  custom:        "Custom",
};

// Compact variants for tight layouts like the Library card time grid.
export const COMPLETION_LABELS_SHORT: Record<CompletionType, string> = {
  main:          "Main",
  main_sides:    "Main+",
  completionist: "100%",
  average:       "Avg",
  custom:        "Custom",
};

// RGB ↔ hex helpers
export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}
