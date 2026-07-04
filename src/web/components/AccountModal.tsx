import { useState } from "react";
import { useTheme } from "@/lib/ThemeContext";

interface User { id: string; email: string; username?: string | null; }

interface Props {
  user: User;
  onClose: () => void;
  onUpdateUser: (u: User) => void;
  onDeleted: () => void;
}

export function AccountModal({ user, onClose, onUpdateUser, onDeleted }: Props) {
  const { theme: t } = useTheme();

  // Display name
  const [name, setName] = useState(user.username ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [nameError, setNameError] = useState("");

  // Password change
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pwError, setPwError] = useState("");

  // Delete account
  const [showDelete, setShowDelete] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delConfirm, setDelConfirm] = useState("");
  const [delLoading, setDelLoading] = useState(false);
  const [delError, setDelError] = useState("");

  const inputStyle = {
    width: "100%", boxSizing: "border-box" as const,
    background: t.bgInput, border: `1px solid ${t.border}`,
    color: t.textPrimary, padding: "8px 10px",
    fontSize: 16, fontFamily: "DM Mono, monospace", outline: "none",
  };
  const labelStyle = {
    fontSize: 12, color: t.textSecondary, textTransform: "uppercase" as const,
    letterSpacing: "0.1em", marginBottom: 5,
  };
  const sectionTitle = {
    fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 700,
    color: t.accentText, letterSpacing: "0.06em", textTransform: "uppercase" as const,
  };
  const focus = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = t.accent);
  const blur = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = t.border);

  const primaryBtn = (disabled: boolean) => ({
    padding: "9px 16px", background: t.accentBg, border: `1px solid ${t.accent}`,
    color: t.accentText, cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
    letterSpacing: "0.1em", textTransform: "uppercase" as const,
    clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
    opacity: disabled ? 0.6 : 1,
  });

  const errorBox = (msg: string) => (
    <div style={{ fontSize: 13, color: t.danger, background: `${t.danger}12`, border: `1px solid ${t.danger}30`, padding: "6px 10px" }}>
      {msg}
    </div>
  );

  const saveName = async () => {
    setNameError("");
    const next = name.trim();
    if (next === (user.username ?? "")) return;
    setNameStatus("saving");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: next }), credentials: "include",
      });
      const data = await res.json() as any;
      if (!res.ok) { setNameError(data.error ?? "Couldn't update display name"); setNameStatus("idle"); return; }
      onUpdateUser(data.user);
      setName(data.user.username ?? "");
      setNameStatus("saved");
      setTimeout(() => setNameStatus("idle"), 2000);
    } catch (e: any) {
      setNameError(e.message ?? "Network error"); setNameStatus("idle");
    }
  };

  const savePassword = async () => {
    setPwError("");
    if (!curPw || !newPw) { setPwError("Enter your current and new password"); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwError("New passwords don't match"); return; }
    if (newPw === curPw) { setPwError("New password must differ from the current one"); return; }
    setPwStatus("saving");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }), credentials: "include",
      });
      const data = await res.json() as any;
      if (!res.ok) { setPwError(data.error ?? "Couldn't change password"); setPwStatus("idle"); return; }
      setCurPw(""); setNewPw(""); setConfirmPw("");
      setPwStatus("saved");
      setTimeout(() => setPwStatus("idle"), 3000);
    } catch (e: any) {
      setPwError(e.message ?? "Network error"); setPwStatus("idle");
    }
  };

  const deleteAccount = async () => {
    setDelError("");
    if (!delPw) { setDelError("Enter your password to confirm"); return; }
    if (delConfirm.trim().toUpperCase() !== "DELETE") { setDelError('Type DELETE to confirm'); return; }
    setDelLoading(true);
    try {
      const res = await fetch("/api/auth/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: delPw }), credentials: "include",
      });
      const data = await res.json() as any;
      if (!res.ok) { setDelError(data.error ?? "Couldn't delete account"); setDelLoading(false); return; }
      onDeleted();
    } catch (e: any) {
      setDelError(e.message ?? "Network error"); setDelLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.bgSurface, border: `1px solid ${t.border}`,
          width: 400, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: 28,
          clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)",
          display: "flex", flexDirection: "column", gap: 20,
          boxShadow: t.shadowMd,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 700, color: t.accentText, letterSpacing: "0.06em" }}>
              MANAGE ACCOUNT
            </div>
            <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 2, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.email}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: t.textSecondary, cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
        </div>

        {/* Display name */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={sectionTitle}>Display Name</div>
          <div>
            <div style={labelStyle}>Name</div>
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveName()}
              placeholder="Not set" maxLength={40} aria-label="Display name" style={inputStyle}
              onFocus={focus} onBlur={blur} />
          </div>
          {nameError && errorBox(nameError)}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={saveName} disabled={nameStatus === "saving" || name.trim() === (user.username ?? "")} style={primaryBtn(nameStatus === "saving" || name.trim() === (user.username ?? ""))}>
              {nameStatus === "saving" ? "..." : "Save Name"}
            </button>
            {nameStatus === "saved" && <span style={{ fontSize: 12, color: t.success }}>✓ Saved</span>}
          </div>
        </div>

        <div style={{ height: 1, background: t.border }} />

        {/* Change password */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={sectionTitle}>Change Password</div>
          <div>
            <div style={labelStyle}>Current Password</div>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)}
              placeholder="••••••••" aria-label="Current password" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <div style={labelStyle}>New Password</div>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder="Min 8 characters" aria-label="New password" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <div style={labelStyle}>Confirm New Password</div>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={e => e.key === "Enter" && savePassword()}
              placeholder="Re-enter new password" aria-label="Confirm new password" style={inputStyle} onFocus={focus} onBlur={blur} />
          </div>
          {pwError && errorBox(pwError)}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={savePassword} disabled={pwStatus === "saving"} style={primaryBtn(pwStatus === "saving")}>
              {pwStatus === "saving" ? "..." : "Update Password"}
            </button>
            {pwStatus === "saved" && <span style={{ fontSize: 12, color: t.success }}>✓ Password changed</span>}
          </div>
          {pwStatus === "saved" && (
            <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
              Other devices have been signed out.
            </div>
          )}
        </div>

        <div style={{ height: 1, background: t.border }} />

        {/* Danger zone */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...sectionTitle, color: t.danger }}>Danger Zone</div>
          {!showDelete ? (
            <>
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                Permanently delete your account and all saved calendar data. This cannot be undone.
              </div>
              <button onClick={() => setShowDelete(true)} style={{
                alignSelf: "flex-start", padding: "8px 14px", background: "transparent",
                border: `1px solid ${t.danger}`, color: t.danger, cursor: "pointer",
                fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Delete Account</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                Enter your password and type <strong style={{ color: t.danger }}>DELETE</strong> to confirm.
              </div>
              <div>
                <div style={labelStyle}>Password</div>
                <input type="password" value={delPw} onChange={e => setDelPw(e.target.value)}
                  placeholder="••••••••" aria-label="Confirm password" style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div>
                <div style={labelStyle}>Type DELETE</div>
                <input value={delConfirm} onChange={e => setDelConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && deleteAccount()}
                  placeholder="DELETE" aria-label="Type DELETE to confirm" style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              {delError && errorBox(delError)}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={deleteAccount} disabled={delLoading} style={{
                  padding: "9px 16px", background: `${t.danger}18`, border: `1px solid ${t.danger}`,
                  color: t.danger, cursor: delLoading ? "not-allowed" : "pointer",
                  fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
                  opacity: delLoading ? 0.6 : 1,
                }}>{delLoading ? "..." : "Permanently Delete"}</button>
                <button onClick={() => { setShowDelete(false); setDelPw(""); setDelConfirm(""); setDelError(""); }} style={{
                  padding: "9px 16px", background: "transparent", border: `1px solid ${t.border}`,
                  color: t.textSecondary, cursor: "pointer",
                  fontSize: 12, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
