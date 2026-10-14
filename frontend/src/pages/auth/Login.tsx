import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, mfaVerify, apiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

function BrandMark() {
  return (
    <span className="brand-mark" style={{ width: 40, height: 40 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.4-3 8.2-7 9-4-0.8-7-4.6-7-9V6l7-3z" />
        <path d="M8.5 12l2.5 2.5 4.5-4.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [stage, setStage] = useState<"login" | "mfa">("login");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const res = await login(email, password);
      if (res.mfaRequired) {
        setSession(res.csrfToken);
        setStage("mfa");
      } else {
        setSession(res.csrfToken, res.user);
        navigate("/");
      }
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
  }

  async function onMfa(e: FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const res = await mfaVerify(useRecovery ? { recoveryCode: code } : { token: code });
      setSession(res.csrfToken, res.user);
      navigate("/");
    } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="aurora" />
      <div className="auth-card">
        <div className="auth-brand"><BrandMark /><span className="brand-name" style={{ fontSize: 22 }}>Certi<span>Guard</span></span></div>
        {stage === "login" ? (
          <>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-sub">Sign in to the certificate security platform.</p>
            {error && <div className="alert error">{error}</div>}
            <form onSubmit={onLogin}>
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
              </div>
              <div className="field">
                <label>Password</label>
                <div className="input-group">
                  <input className="input" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  <button type="button" className="toggle" onClick={() => setShowPw((v) => !v)}>{showPw ? "Hide" : "Show"}</button>
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
                {busy ? <span className="spinner" /> : "Sign in"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <Link to="/forgot-password" style={{ color: "var(--violet-soft)", fontSize: 13 }}>Forgot password?</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="auth-title">Two-factor authentication</h1>
            <p className="auth-sub">{useRecovery ? "Enter a recovery code." : "Enter the 6-digit code from your authenticator app."}</p>
            {error && <div className="alert error">{error}</div>}
            <form onSubmit={onMfa}>
              <div className="field">
                <label>{useRecovery ? "Recovery code" : "Authentication code"}</label>
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)} autoFocus
                  inputMode={useRecovery ? "text" : "numeric"} placeholder={useRecovery ? "XXXXXXXXXX" : "123456"} required />
              </div>
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
                {busy ? <span className="spinner" /> : "Verify"}
              </button>
            </form>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(""); }}>
                {useRecovery ? "Use authenticator code" : "Use a recovery code"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
