import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgotPassword, resetPassword, apiErrorMessage } from "../../api/client";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"request" | "reset">("request");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const navigate = useNavigate();

  async function onRequest(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const res = await forgotPassword(email);
      setInfo("If the account exists, a reset token has been issued.");
      if (res.resetTokenDev) { setToken(res.resetTokenDev); setStage("reset"); }
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await resetPassword(token, newPassword);
      navigate("/login");
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="aurora" />
      <div className="auth-card">
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-sub">We never reveal whether an account exists.</p>
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert info">{info}</div>}
        {stage === "request" ? (
          <form onSubmit={onRequest}>
            <div className="field"><label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>{busy ? <span className="spinner" /> : "Request reset"}</button>
          </form>
        ) : (
          <form onSubmit={onReset}>
            <div className="field"><label>Reset token</label>
              <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required /></div>
            <div className="field"><label>New password</label>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <div className="hint">At least 10 characters with upper, lower, and a digit.</div></div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>{busy ? <span className="spinner" /> : "Set new password"}</button>
          </form>
        )}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/login" style={{ color: "var(--violet-soft)", fontSize: 13 }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
