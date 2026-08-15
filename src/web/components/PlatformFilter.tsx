import { useState } from "react";
import { useTheme } from "@/lib/ThemeContext";

/**
 * Multi-select platform filter dropdown with checkboxes. An empty selection
 * means "no filter" (show everything). Options are the platforms present in
 * the current library; selection state lives in the parent so stale choices
 * can be pruned there when games leave the library.
 */
export function PlatformFilter({ options, selected, onChange }: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { theme: t } = useTheme();
  const [open, setOpen] = useState(false);
  const active = selected.length > 0;
  const toggle = (p: string) =>
    onChange(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Filter by platform"
        aria-expanded={open}
        style={{
          background: t.bgInput, border: `1px solid ${active || open ? t.accent : t.border}`,
          color: active || open ? t.accentText : t.textSecondary, padding: "3px 6px",
          fontSize: 12, fontFamily: "DM Mono, monospace",
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        Platforms{active ? ` (${selected.length})` : ""} {open ? "▴" : "▾"}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200,
            background: t.bgElevated, border: `1px solid ${t.accentBorder}`,
            padding: "8px 10px", minWidth: 180, maxWidth: 240, maxHeight: 260, overflowY: "auto",
            boxShadow: t.accentGlow !== "none" ? t.accentGlow : "0 4px 16px rgba(0,0,0,0.4)",
            clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
          }}>
            {options.map(p => (
              <label key={p} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "4px 0",
                fontSize: 12, fontFamily: "DM Mono, monospace", cursor: "pointer",
                color: selected.includes(p) ? t.accentText : t.textSecondary,
              }}>
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  onChange={() => toggle(p)}
                  style={{ accentColor: t.accent, cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
              </label>
            ))}
            {active && (
              <button
                onClick={() => onChange([])}
                style={{
                  marginTop: 6, width: "100%", padding: "4px 0",
                  background: "transparent", border: `1px solid ${t.borderSubtle}`,
                  color: t.textMuted, cursor: "pointer", fontSize: 11, fontFamily: "DM Mono, monospace",
                }}
              >Clear filter</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
