import { useEffect, useState } from "react";
import {
  mfaEnroll, mfaConfirm, mfaDisable, changePassword, fetchSessions, apiErrorMessage,
} from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader, useToast } from "../../components/ui";

export function AccountSecurity() {
  const { user, refresh, setSession } = useAuth();
  const toast = useToast();
  const [enroll, setEnroll] = useState<{ qrDataUrl: string; recoveryCodes: string[] } | null>(null);
  const [confirmToken, setConfirmToken] = useState("");
  const [disablePw, setDisablePw] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [recoveryRemaining, setRecoveryRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchSessions().then((s) => setRecoveryRemaining(s.recoveryCodesRemaining)).catch(() => {}); }, [user?.mfaEnabled]);

  async function startEnroll() {
    setBusy(true);
    try { setEnroll(await mfaEnroll()); } catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);
    try { await mfaConfirm(confirmToken); setEnroll(null); setConfirmToken(""); await refresh(); toast.push("success", "MFA enabled."); }
    catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try { await mfaDisable(disablePw, disableToken); setDisablePw(""); setDisableToken(""); await refresh(); toast.push("success", "MFA disabled."); }
    catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function changePw() {
    setBusy(true);
    try { const r = await changePassword(curPw, newPw); setSession(r.csrfToken); setCurPw(""); setNewPw(""); toast.push("success", "Password changed; other sessions signed out."); }
    catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Account" accent="Security" subtitle="Manage your password and multi-factor authentication." />
      <div className="grid cols-2">
        <div className="card">
          <h3 className="card-title">Multi-factor authentication</h3>
          <p className="card-desc">Status: <b style={{ color: user?.mfaEnabled ? "var(--ok)" : "var(--text-2)" }}>{user?.mfaEnabled ? "Enabled" : "Disabled"}</b>
            {recoveryRemaining != null && user?.mfaEnabled ? ` · ${recoveryRemaining} recovery codes remaining` : ""}</p>

          {!user?.mfaEnabled && !enroll && (
            <button className="btn btn-primary" onClick={startEnroll} disabled={busy}>Enable MFA</button>
          )}

          {enroll && (
            <div>
              <p className="card-desc">Scan this QR code with Google Authenticator / Microsoft Authenticator, then enter a code to confirm.</p>
              <img src={enroll.qrDataUrl} alt="MFA QR" style={{ width: 180, borderRadius: 8, background: "#fff", padding: 6 }} />
              <div className="alert info" style={{ marginTop: 12 }}>
                <b>Recovery codes (shown once):</b>
                <div className="mono" style={{ marginTop: 6 }}>{enroll.recoveryCodes.join("  ")}</div>
              </div>
              <div className="field"><label>Authentication code</label>
                <input className="input" value={confirmToken} onChange={(e) => setConfirmToken(e.target.value)} placeholder="123456" /></div>
              <button className="btn btn-primary" onClick={confirm} disabled={busy || !confirmToken}>Confirm &amp; enable</button>
            </div>
          )}

          {user?.mfaEnabled && (
            <div style={{ marginTop: 10 }}>
              <div className="field"><label>Current password</label>
                <input className="input" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} /></div>
              <div className="field"><label>Authentication code</label>
                <input className="input" value={disableToken} onChange={(e) => setDisableToken(e.target.value)} placeholder="123456" /></div>
              <button className="btn btn-danger" onClick={disable} disabled={busy || !disablePw || !disableToken}>Disable MFA</button>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Change password</h3>
          <p className="card-desc">Changing your password signs out your other sessions.</p>
          <div className="field"><label>Current password</label>
            <input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} /></div>
          <div className="field"><label>New password</label>
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            <div className="hint">At least 10 characters with upper, lower, and a digit.</div></div>
          <button className="btn btn-primary" onClick={changePw} disabled={busy || !curPw || !newPw}>Update password</button>
        </div>
      </div>
    </>
  );
}
