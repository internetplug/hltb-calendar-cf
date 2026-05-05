import { useState } from "react";
import { hexToRgb, rgbToHex } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

const PRESETS = [
  "#00e5ff", "#00cc88", "#ffaa00", "#ff6644",
  "#aa44ff", "#ff4488", "#44aaff", "#88ff44",
  "#ff8800", "#00ffaa", "#ff3355", "#bf00ff",
  "#e06090", "#4aaa78", "#e07820", "#4a9eff",
];

interface Props {
  color: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ color, onChange }: Props) {
  const { theme: t } = useTheme();
  const [open, setOpen] = useState(false);

  const [r, g, b] = hexToRgb(color.startsWith("#") && color.length === 7 ? color : "#00e5ff");

  const sliderStyle = (channel: "r" | "g" | "b") => {
    const gradients = {
      r: `linear-gradient(to right, ${rgbToHex(0, g, b)}, ${rgbToHex(255, g, b)})`,
      g: `linear-gradient(to right, ${rgbToHex(r, 0, b)}, ${rgbToHex(r, 255, b)})`,
      b: `linear-gradient(to right, ${rgbToHex(r, g, 0)}, ${rgbToHex(r, g, 255)})`,
    };
    return {
      width: "100%",
      height: 10,
      borderRadius: 5,
      outline: "none",
      cursor: "pointer",
      background: gradients[channel],
      accentColor: color,
    };
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Swatch trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 22, height: 22,
          background: color,
          border: `2px solid ${open ? t.textPrimary : t.border}`,
          cursor: "pointer",
          flexShrink: 0,
          padding: 0,
          boxShadow: open ? `0 0 0 1px ${color}` : "none",
        }}
      />

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              width: 220,
              background: t.bgSurface,
              border: `1px solid ${t.border}`,
              padding: 12,
              zIndex: 300,
              clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)",
              boxShadow: t.shadowMd,
            }}
          >
            {/* Current color preview */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, background: color, flexShrink: 0, border: `1px solid ${t.border}` }} />
            </div>

            {/* RGB sliders */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {(["r", "g", "b"] as const).map((ch, idx) => {
                const val = [r, g, b][idx];
                const label = ch.toUpperCase();
                return (
                  <div key={ch} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 12, fontSize: 12, fontFamily: "DM Mono, monospace", color: t.textSecondary, fontWeight: 700 }}>{label}</span>
                    <input
                      type="range" min={0} max={255} value={val}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        const newColor = ch === "r" ? rgbToHex(v, g, b) : ch === "g" ? rgbToHex(r, v, b) : rgbToHex(r, g, v);
                        onChange(newColor);
                      }}
                      style={sliderStyle(ch) as any}
                    />
                    <span style={{ width: 28, textAlign: "right", fontSize: 12, fontFamily: "DM Mono, monospace", color: t.textSecondary }}>{val}</span>
                  </div>
                );
              })}
            </div>

            {/* Presets */}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 12, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Presets</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
                {PRESETS.map(c => (
                  <button
                    key={c}
                    onClick={() => { onChange(c); setOpen(false); }}
                    title={c}
                    style={{
                      width: 20, height: 20, background: c, border: `2px solid ${c === color ? t.textPrimary : "transparent"}`,
                      cursor: "pointer", padding: 0, flexShrink: 0,
                      borderRadius: 2,
                      boxShadow: c === color ? `0 0 0 1px ${c}` : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
