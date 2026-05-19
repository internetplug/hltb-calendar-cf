import { useState } from "react";
import { DaySchedule, DAY_NAMES_FULL } from "@/lib/store";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  schedule: DaySchedule;
  onUpdate: (schedule: DaySchedule) => void;
}

export function ScheduleConfig({ schedule, onUpdate }: Props) {
  const { theme: t } = useTheme();
  const [open, setOpen] = useState(false);
  const totalWeekly = Object.values(schedule).reduce((a, b) => a + b, 0);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px",
          background: open ? t.accentBg : t.bgElevated,
          border: `1px solid ${open ? t.accent : t.border}`,
          color: open ? t.accentText : t.textPrimary,
          cursor: "pointer", fontSize: 12,
          fontFamily: "DM Mono, monospace",
          clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
          transition: "all 0.15s",
          boxShadow: open && t.accentGlow !== "none" ? t.accentGlow : "none",
        }}
      >
        <span>Schedule</span>
        <span style={{ color: t.textSecondary, marginLeft: 2 }}>{totalWeekly}h/wk</span>
        <span style={{ marginLeft: 4, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            width: 290, background: t.bgSurface,
            border: `1px solid ${t.border}`,
            padding: 16, zIndex: 100,
            clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)",
            boxShadow: t.shadowMd,
          }}>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 10, color: t.accentText }}>
              WEEKLY SCHEDULE
            </div>
            <div style={{ fontSize: 12, color: t.textSecondary, marginBottom: 12 }}>
              Set daily play hours. Multiple games share time on the same day.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2, 3, 4, 5, 6].map(day => {
                const hours = schedule[day] ?? 0;
                return (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, fontSize: 12, color: t.textSecondary, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, textTransform: "uppercase" }}>
                      {DAY_NAMES_FULL[day].slice(0, 3)}
                    </div>
                    <div style={{ flex: 1, position: "relative", height: 4, background: t.border }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, height: "100%",
                        width: `${Math.min(100, (hours / 12) * 100)}%`,
                        background: hours > 0 ? t.accent : t.border,
                        boxShadow: hours > 0 && t.accentGlow !== "none" ? `0 0 6px ${t.accent}60` : "none",
                        transition: "width 0.1s",
                      }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => onUpdate({ ...schedule, [day]: Math.max(0, hours - 0.5) })}
                        style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, padding: 0 }}>−</button>
                      <span style={{ width: 28, textAlign: "center", fontSize: 11, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, color: hours > 0 ? t.textPrimary : t.textDisabled }}>
                        {hours}h
                      </span>
                      <button onClick={() => onUpdate({ ...schedule, [day]: Math.min(24, hours + 0.5) })}
                        style={{ background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textPrimary, width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, padding: 0 }}>+</button>
                    </div>
                    <input
                      type="number" min={0} max={24} step={0.5} value={hours}
                      onChange={e => onUpdate({ ...schedule, [day]: Math.min(24, Math.max(0, parseFloat(e.target.value) || 0)) })}
                      style={{
                        width: 38, background: t.bgInput, border: `1px solid ${t.border}`,
                        color: t.textPrimary, padding: "2px 4px", fontSize: 12,
                        fontFamily: "DM Mono, monospace", textAlign: "center", outline: "none",
                        colorScheme: t.mode === "dark" ? "dark" : "light",
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: t.textSecondary }}>Total weekly</span>
              <span style={{ color: t.accentText, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}>{totalWeekly}h</span>
            </div>

            <button
              onClick={() => setOpen(false)}
              style={{ marginTop: 10, width: "100%", padding: "7px", background: t.bgElevated, border: `1px solid ${t.border}`, color: t.textSecondary, cursor: "pointer", fontSize: 12, fontFamily: "DM Mono, monospace" }}
            >Close</button>
          </div>
        </>
      )}
    </div>
  );
}
