// ─── Theme System ─────────────────────────────────────────────────────────────
// Each theme defines a set of semantic color tokens.
// Dark themes use neon/vibrant accents; light themes use softer pastels.

export type ColorMode = "dark" | "light";
export type ThemeId =
  | "cyber-cyan"   // dark  — original neon cyan
  | "neon-purple"  // dark  — electric violet
  | "toxic-green"  // dark  — matrix green
  | "infra-red"    // dark  — hot coral/red
  | "midnight"     // dark  — minimal monochrome blue-grey
  | "sky"          // light — soft sky blue
  | "rose"         // light — dusty rose/pink
  | "sage"         // light — muted sage green
  | "amber"        // light — warm amber
  | "minimal"      // light — pure greyscale minimal

export interface ThemeColors {
  id: ThemeId;
  mode: ColorMode;
  label: string;
  swatch: string; // preview dot color

  // Backgrounds
  bgVoid: string;
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgInput: string;

  // Borders
  border: string;
  borderSubtle: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;

  // Accent (primary interactive color)
  accent: string;
  accentDim: string;
  accentBg: string;       // very subtle accent fill e.g. #00e5ff14
  accentBorder: string;   // e.g. #00e5ff40
  accentGlow: string;     // box-shadow glow, may be "none" for light/minimal
  accentText: string;     // readable accent text (same as accent in dark, darker in light)

  // Status
  danger: string;
  success: string;
  warning: string;

  // Scrollbar
  scrollThumb: string;
  scrollThumbHover: string;

  // Misc
  shadowMd: string;
  clipCornerColor: string; // typically matches bgSurface
}

// ─── Dark themes ──────────────────────────────────────────────────────────────

const DARK_BASE = {
  mode: "dark" as ColorMode,
  bgVoid: "#0a0a0c",
  bgBase: "#0e0e12",
  bgSurface: "#111114",
  bgElevated: "#18181d",
  bgInput: "#0a0a0c",
  border: "#2a2a32",
  borderSubtle: "#1a1a20",
  textPrimary: "#e8e8ec",
  textSecondary: "#7a7a8a",
  textMuted: "#4a4a58",
  textDisabled: "#3a3a48",
  danger: "#ff4466",
  success: "#00cc88",
  warning: "#ffaa00",
  scrollThumb: "#2a2a32",
  shadowMd: "0 8px 32px #00000080",
  clipCornerColor: "#111114",
};

const LIGHT_BASE = {
  mode: "light" as ColorMode,
  bgVoid: "#f0f0f5",
  bgBase: "#f7f7fc",
  bgSurface: "#ffffff",
  bgElevated: "#efeff5",
  bgInput: "#f7f7fc",
  border: "#d0d0dc",
  borderSubtle: "#e0e0ea",
  textPrimary: "#1a1a28",
  textSecondary: "#5a5a72",
  textMuted: "#9090a8",
  textDisabled: "#b8b8cc",
  danger: "#e03050",
  success: "#1a9e68",
  warning: "#c47a00",
  scrollThumb: "#c8c8d8",
  shadowMd: "0 8px 32px #00000018",
  clipCornerColor: "#ffffff",
};

// ─── Theme definitions ────────────────────────────────────────────────────────

export const THEMES: Record<ThemeId, ThemeColors> = {
  "cyber-cyan": {
    ...DARK_BASE,
    id: "cyber-cyan",
    label: "Cyber Cyan",
    swatch: "#00e5ff",
    accent: "#00e5ff",
    accentDim: "#00b8cc",
    accentBg: "#00e5ff14",
    accentBorder: "#00e5ff40",
    accentGlow: "0 0 12px #00e5ff30",
    accentText: "#00e5ff",
    scrollThumbHover: "#00e5ff44",
  },
  "neon-purple": {
    ...DARK_BASE,
    id: "neon-purple",
    label: "Neon Purple",
    swatch: "#bf00ff",
    accent: "#bf00ff",
    accentDim: "#9900cc",
    accentBg: "#bf00ff14",
    accentBorder: "#bf00ff40",
    accentGlow: "0 0 12px #bf00ff30",
    accentText: "#bf00ff",
    scrollThumbHover: "#bf00ff44",
  },
  "toxic-green": {
    ...DARK_BASE,
    id: "toxic-green",
    label: "Toxic Green",
    swatch: "#39ff14",
    accent: "#39ff14",
    accentDim: "#2acc10",
    accentBg: "#39ff1414",
    accentBorder: "#39ff1440",
    accentGlow: "0 0 12px #39ff1430",
    accentText: "#39ff14",
    scrollThumbHover: "#39ff1444",
  },
  "infra-red": {
    ...DARK_BASE,
    id: "infra-red",
    label: "Infra Red",
    swatch: "#ff3355",
    accent: "#ff3355",
    accentDim: "#cc2244",
    accentBg: "#ff335514",
    accentBorder: "#ff335540",
    accentGlow: "0 0 12px #ff335530",
    accentText: "#ff3355",
    scrollThumbHover: "#ff335544",
  },
  "midnight": {
    ...DARK_BASE,
    id: "midnight",
    label: "Midnight",
    swatch: "#8888aa",
    accent: "#8888aa",
    accentDim: "#6666aa",
    accentBg: "#8888aa14",
    accentBorder: "#8888aa40",
    accentGlow: "none",
    accentText: "#aaaacc",
    scrollThumbHover: "#8888aa66",
  },

  // ─── Light themes ─────────────────────────────────────────────────────────

  "sky": {
    ...LIGHT_BASE,
    id: "sky",
    label: "Sky Blue",
    swatch: "#4a9eff",
    accent: "#4a9eff",
    accentDim: "#2277dd",
    accentBg: "#4a9eff14",
    accentBorder: "#4a9eff60",
    accentGlow: "none",
    accentText: "#1a6ad0",
    scrollThumbHover: "#4a9eff66",
  },
  "rose": {
    ...LIGHT_BASE,
    id: "rose",
    label: "Dusty Rose",
    swatch: "#e06090",
    accent: "#e06090",
    accentDim: "#cc4477",
    accentBg: "#e0609014",
    accentBorder: "#e0609060",
    accentGlow: "none",
    accentText: "#b83060",
    scrollThumbHover: "#e0609066",
  },
  "sage": {
    ...LIGHT_BASE,
    id: "sage",
    label: "Sage Green",
    swatch: "#4aaa78",
    accent: "#4aaa78",
    accentDim: "#2e8858",
    accentBg: "#4aaa7814",
    accentBorder: "#4aaa7860",
    accentGlow: "none",
    accentText: "#1e7a50",
    scrollThumbHover: "#4aaa7866",
  },
  "amber": {
    ...LIGHT_BASE,
    id: "amber",
    label: "Warm Amber",
    swatch: "#e07820",
    accent: "#e07820",
    accentDim: "#c05c00",
    accentBg: "#e0782014",
    accentBorder: "#e0782060",
    accentGlow: "none",
    accentText: "#b05010",
    scrollThumbHover: "#e0782066",
  },
  "minimal": {
    ...LIGHT_BASE,
    id: "minimal",
    label: "Minimal",
    swatch: "#444455",
    bgVoid: "#fafafa",
    bgBase: "#ffffff",
    bgSurface: "#ffffff",
    bgElevated: "#f5f5f8",
    bgInput: "#f9f9f9",
    border: "#e0e0e0",
    borderSubtle: "#eeeeee",
    accent: "#444455",
    accentDim: "#222233",
    accentBg: "#44445508",
    accentBorder: "#44445530",
    accentGlow: "none",
    accentText: "#222233",
    scrollThumbHover: "#44445566",
  },
};

export const DARK_THEME_IDS: ThemeId[] = ["cyber-cyan", "neon-purple", "toxic-green", "infra-red", "midnight"];
export const LIGHT_THEME_IDS: ThemeId[] = ["sky", "rose", "sage", "amber", "minimal"];

export function getTheme(id: ThemeId): ThemeColors {
  return THEMES[id];
}

// Helpers for consistent inline style patterns
export function accentStyle(t: ThemeColors, active: boolean) {
  return {
    background: active ? t.accentBg : "transparent",
    border: `1px solid ${active ? t.accent : t.border}`,
    color: active ? t.accentText : t.textSecondary,
    boxShadow: active && t.accentGlow !== "none" ? t.accentGlow : "none",
  };
}
