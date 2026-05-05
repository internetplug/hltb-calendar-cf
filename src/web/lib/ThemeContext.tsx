import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ThemeId, ThemeColors, getTheme, THEMES } from "./theme";

interface ThemeCtx {
  themeId: ThemeId;
  theme: ThemeColors;
  setThemeId: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  themeId: "cyber-cyan",
  theme: THEMES["cyber-cyan"],
  setThemeId: () => {},
});

const STORAGE_KEY = "hltb_calendar_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (saved && THEMES[saved]) return saved;
    } catch {}
    return "cyber-cyan";
  });

  const theme = getTheme(themeId);

  // Apply bg/text and CSS vars to body
  useEffect(() => {
    document.body.style.background = theme.bgVoid;
    document.body.style.color = theme.textPrimary;
    document.body.style.setProperty("--gc-scroll", theme.scrollThumb);
    document.body.style.setProperty("--gc-scroll-hover", theme.scrollThumbHover);
  }, [theme]);

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  };

  return (
    <ThemeContext.Provider value={{ themeId, theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
