import { useState } from "react";
import { useTheme } from "@/lib/ThemeContext";
import { DARK_THEME_IDS, LIGHT_THEME_IDS, THEMES, ThemeId } from "@/lib/theme";

export function ThemePicker() {
  const { themeId, theme: t, setThemeId } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Change theme"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 11px",
          background: open ? t.accentBg : t.bgElevated,
          border: `1px solid ${open ? t.accent : t.border}`,
          color: open ? t.accentText : t.textSecondary,
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "Rajdhani, sans-serif",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          clipPath: "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%)",
          transition: "all 0.15s",
          boxShadow: open && t.accentGlow !== "none" ? t.accentGlow : "none",
        }}
      >
        {/* Color swatch of current theme */}
        <span style={{
          display: "inline-block", width: 10, height: 10,
          background: t.accent,
          borderRadius: "50%",
          boxShadow: t.accentGlow !== "none" ? `0 0 6px ${t.accent}80` : "none",
          flexShrink: 0,
        }} />
        <span>Theme</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 199 }}
          />
          <div style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 240,
            background: t.bgSurface,
            border: `1px solid ${t.border}`,
            padding: "14px",
            zIndex: 200,
            clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)",
            boxShadow: t.shadowMd,
          }}>
            {/* Dark themes */}
            <div style={{ fontSize: 12, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
              Dark
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
              {DARK_THEME_IDS.map(id => (
                <ThemeRow key={id} id={id} active={themeId === id} onSelect={() => { setThemeId(id); setOpen(false); }} />
              ))}
            </div>

            {/* Light themes */}
            <div style={{ fontSize: 12, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
              Light
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {LIGHT_THEME_IDS.map(id => (
                <ThemeRow key={id} id={id} active={themeId === id} onSelect={() => { setThemeId(id); setOpen(false); }} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThemeRow({ id, active, onSelect }: { id: ThemeId; active: boolean; onSelect: () => void }) {
  const { theme: t } = useTheme();
  const entry = THEMES[id];

  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        background: active ? t.accentBg : "transparent",
        border: `1px solid ${active ? t.accent : "transparent"}`,
        color: active ? t.accentText : t.textSecondary,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        borderRadius: 2,
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.bgElevated; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{
        display: "inline-block",
        width: 14, height: 14,
        background: entry.accent,
        borderRadius: "50%",
        flexShrink: 0,
        border: `2px solid ${active ? t.accent : t.border}`,
        boxShadow: entry.accentGlow !== "none" ? `0 0 6px ${entry.accent}80` : "none",
      }} />
      <span style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: "0.04em" }}>
        {entry.label}
      </span>
      {active && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: t.accentText }}>✓</span>
      )}
    </button>
  );
}
