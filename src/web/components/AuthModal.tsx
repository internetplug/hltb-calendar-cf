import { useState } from "react";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  onClose: () => void;
  onAuth: (user: { id: string; email: string }) => void;
}

export function AuthModal({ onClose, onAuth }: Props) {
  const { theme: t } = useTheme();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    width: "100%", boxSizing: "border-box" as const,
    background: t.bgInput, border: `1px solid ${t.border}`,
    color: t.textPrimary, padding: "8px 10px",
    fontSize: 13, fontFamily: "DM Mono, monospace", outline: "none",
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Email and password required"); return; }
    if (mode === "register" && password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include",
      });
      const data = await res.json() as any;
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      onAuth(data.user);
    } catch (e: any) {
      setError(e.message ?? "Network error");
    } finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.bgSurface, border: `1px solid ${t.border}`,
          width: 360, padding: 28,
          clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)",
          display: "flex", flexDirection: "column", gap: 16,
          boxShadow: t.shadowMd,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 700, color: t.accentText, letterSpacing: "0.06em" }}>
              {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
            </div>
            <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 2 }}>
              {mode === "login" ? "Load your saved calendar" : "Save your calendar to the cloud"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.textSecondary, cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
        </div>

        <div style={{ display: "flex", border: `1px solid ${t.border}`, overflow: "hidden" }}>
          {(["login", "register"] as const).map((m, i) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1, padding: "7px 0",
                background: mode === m ? t.accentBg : "transparent",
                border: "none", borderRight: i === 0 ? `1px solid ${t.border}` : "none",
                color: mode === m ? t.accentText : t.textSecondary,
                cursor: "pointer", fontSize: 13,
                fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >{m === "login" ? "Sign In" : "Register"}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="you@example.com" autoFocus style={inputStyle}
              onFocus={e => (e.target.style.borderColor = t.accent)}
              onBlur={e => (e.target.style.borderColor = t.border)}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: t.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Password</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
              placeholder={mode === "register" ? "Min 6 characters" : "••••••••"} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = t.accent)}
              onBlur={e => (e.target.style.borderColor = t.border)}
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: t.danger, background: `${t.danger}12`, border: `1px solid ${t.danger}30`, padding: "6px 10px" }}>
            {error}
          </div>
        )}

        <button onClick={submit} disabled={loading} style={{
          padding: "10px 0", background: t.accentBg, border: `1px solid ${t.accent}`,
          color: t.accentText, cursor: loading ? "not-allowed" : "pointer",
          fontSize: 13, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase",
          clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
          boxShadow: !loading && t.accentGlow !== "none" ? t.accentGlow : "none",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <div style={{ fontSize: 12, color: t.textMuted, textAlign: "center", lineHeight: 1.5 }}>
          Your calendar is stored privately and only accessible when signed in.
        </div>
      </div>
    </div>
  );
}
