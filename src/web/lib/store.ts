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
  completionOverride: string | null;  // ISO date YYYY-MM-DD to mark complete on specific date, or null for calculated
}

export interface DaySchedule {
  [day: number]: number;
}

export type SchedulingMode = "priority" | "split";

export interface AppState {
  games: ScheduledGame[];
  schedule: DaySchedule;
  dayOverrides: Record<string, number>; // YYYY-MM-DD → hours override
  schedulingMode: SchedulingMode;
  calendarView: "month" | "week";
  calendarDate: string;
}

const STORAGE_KEY = "hltb_calendar_v1";

const DEFAULT_SCHEDULE: DaySchedule = {
  0: 3, 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 3,
};

const DEFAULT_STATE: AppState = {
  games: [],
  schedule: DEFAULT_SCHEDULE,
  dayOverrides: {},
  schedulingMode: "priority",
  calendarView: "month",
  calendarDate: new Date().toISOString().split("T")[0],
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
        customHours: g.customHours !== undefined ? g.customHours : null,
        progressPercent: g.progressPercent !== undefined ? g.progressPercent : 0,
        completionOverride: g.completionOverride !== undefined ? g.completionOverride : null,
      }));
    }
    return { ...DEFAULT_STATE, dayOverrides: {}, ...parsed };
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
  mode: SchedulingMode = "priority",
  dayOverrides: Record<string, number> = {}
): Map<string, GameDayEntry[]> {
  if (games.length === 0) return new Map();

  const sorted = [...games].sort((a, b) => a.priority - b.priority);

  const remaining = new Map<string, number>(sorted.map(g => [g.id, getGameHours(g)]));
  const logged    = new Map<string, number>(sorted.map(g => [g.id, 0]));
  const result    = new Map<string, GameDayEntry[]>(sorted.map(g => [g.id, []]));

  const startDates  = sorted.map(g => new Date(g.startDate + "T00:00:00"));
  const globalStart = startDates.reduce((a, b) => (a < b ? a : b));

  const maxHours = sorted.reduce((s, g) => s + getGameHours(g), 0);
  const avgDaily = Object.values(schedule).reduce((a, b) => a + b, 0) / 7 || 1;
  const maxDays  = Math.ceil((maxHours / avgDaily) * 2) + 365;

  const current = new Date(globalStart);

  for (let day = 0; day < maxDays; day++) {
    const dateStr   = current.toISOString().split("T")[0];
    const dow       = current.getDay();
    let dayBudget   = dayOverrides[dateStr] ?? schedule[dow] ?? 0;

    if (dayBudget > 0) {
      if (mode === "priority") {
        for (const game of sorted) {
          if (dayBudget <= 0) break;
          if (current < new Date(game.startDate + "T00:00:00")) continue;
          const rem = remaining.get(game.id) ?? 0;
          if (rem <= 0) continue;
          const total        = getGameHours(game);
          const loggedSoFar  = logged.get(game.id) ?? 0;
          const hoursThisDay = Math.min(dayBudget, rem);
          result.get(game.id)!.push({
            date: dateStr, hours: hoursThisDay,
            isStart: result.get(game.id)!.length === 0, isEnd: false,
            progress: total > 0 ? loggedSoFar / total : 0,
          });
          dayBudget -= hoursThisDay;
          remaining.set(game.id, rem - hoursThisDay);
          logged.set(game.id, loggedSoFar + hoursThisDay);
        }
      } else {
        const eligible = sorted.filter(g =>
          current >= new Date(g.startDate + "T00:00:00") && (remaining.get(g.id) ?? 0) > 0
        );
        let budget = dayBudget;
        const todayAlloc = new Map<string, number>(sorted.map(g => [g.id, 0]));

        // Phase 1: guaranteed minimums (priority order when budget is tight)
        for (const game of eligible) {
          if (budget <= 0.0001) break;
          const rem   = remaining.get(game.id) ?? 0;
          const given = Math.min(game.minHoursPerDay, rem, budget);
          todayAlloc.set(game.id, given);
          budget -= given;
        }

        // Phase 2: split remainder equally with iterative redistribution
        let redistEligible = eligible.filter(
          g => (remaining.get(g.id) ?? 0) - (todayAlloc.get(g.id) ?? 0) > 0.0001
        );
        while (budget > 0.0001 && redistEligible.length > 0) {
          const share = budget / redistEligible.length;
          let leftover = 0;
          const still: ScheduledGame[] = [];
          for (const game of redistEligible) {
            const rem   = (remaining.get(game.id) ?? 0) - (todayAlloc.get(game.id) ?? 0);
            const given = Math.min(share, rem);
            todayAlloc.set(game.id, (todayAlloc.get(game.id) ?? 0) + given);
            leftover += share - given;
            if (rem - given > 0.0001) still.push(game);
          }
          budget = leftover;
          redistEligible = still;
        }

        // Commit
        for (const game of sorted) {
          const alloc = todayAlloc.get(game.id) ?? 0;
          if (alloc < 0.0001) continue;
          const total       = getGameHours(game);
          const loggedSoFar = logged.get(game.id) ?? 0;
          result.get(game.id)!.push({
            date: dateStr, hours: alloc,
            isStart: result.get(game.id)!.length === 0, isEnd: false,
            progress: total > 0 ? loggedSoFar / total : 0,
          });
          remaining.set(game.id, (remaining.get(game.id) ?? 0) - alloc);
          logged.set(game.id, loggedSoFar + alloc);
        }
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

  return result;
}

export function computeGameDays(
  game: ScheduledGame,
  schedule: DaySchedule,
  allGames: ScheduledGame[],
  mode: SchedulingMode = "priority",
  dayOverrides: Record<string, number> = {}
): GameDayEntry[] {
  return computeAllGameDays(allGames, schedule, mode, dayOverrides).get(game.id) ?? [];
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

export const DAY_NAMES      = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const DAY_NAMES_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export const COMPLETION_LABELS: Record<CompletionType, string> = {
  main:          "Main Story",
  main_sides:    "Main + Sides",
  completionist: "Completionist",
  average:       "Average",
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
