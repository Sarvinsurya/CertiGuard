import { useState } from "react";
import {
  privacyEncrypt,
  privacyDecrypt,
  apiErrorMessage,
  type AesPayload,
} from "../../api/client";
import { LabIntro } from "../../components/LabIntro";

export function EncryptionLab() {
  const [plaintext, setPlaintext] = useState("Student record: Aarav Sharma, CGPA 8.7");
  const [payload, setPayload] = useState<AesPayload | null>(null);
  const [display, setDisplay] = useState<{ nonce: string; tag: string } | null>(null);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onEncrypt() {
    setError(""); setDecrypted(null); setBusy(true);
    try {
      const r = await privacyEncrypt(plaintext);
      setPayload(r.payload);
      setDisplay(r.display);
    } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); }
  }

  async function onDecrypt() {
    if (!payload) return;
    setError(""); setBusy(true);
    try {
      const r = await privacyDecrypt(payload);
      setDecrypted(r.plaintext);
    } catch (e) { setError(apiErrorMessage(e)); setDecrypted(null); } finally { setBusy(false); }
  }

  function tamper(kind: "ciphertext" | "tag") {
    if (!payload) return;
    // Browser-safe: decode base64 → flip first byte → re-encode.
    const bin = atob(payload[kind]);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    let out = "";
    bytes.forEach((b) => (out += String.fromCharCode(b)));
    setPayload({ ...payload, [kind]: btoa(out) });
    setDecrypted(null);
    setError("");
  }

  return (
    <>
      <LabIntro
        title="Encryption" accent="Lab (AES-256-GCM)"
        what="Reversible authenticated encryption. The same key that encrypts can decrypt."
        why="Protects confidentiality of sensitive data at rest/in transit, and detects tampering via the authentication tag."
        how="Node crypto AES-256-GCM on the backend. A fresh 96-bit nonce is generated per operation; a 128-bit tag authenticates the ciphertext. The key never leaves the server."
        limitations="Not hashing (SHA-256 is one-way). Key storage here is a local prototype file, not an HSM/KMS."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h3 className="card-title">1 · Encrypt</h3>
          <div className="field">
            <label>Plaintext (synthetic)</label>
            <textarea className="textarea" value={plaintext} onChange={(e) => setPlaintext(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={onEncrypt} disabled={busy || !plaintext}>Encrypt</button>

          {payload && display && (
            <div style={{ marginTop: 16 }}>
              <div className="cr-desc">Algorithm</div>
              <div className="mono">{payload.alg} (v{payload.v})</div>
              <div className="cr-desc" style={{ marginTop: 10 }}>Nonce / IV (masked)</div>
              <div className="mono">{display.nonce}</div>
              <div className="cr-desc" style={{ marginTop: 10 }}>Auth tag (masked)</div>
              <div className="mono">{display.tag}</div>
              <div className="cr-desc" style={{ marginTop: 10 }}>Ciphertext (base64)</div>
              <div className="mono">{payload.ciphertext}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">2 · Decrypt &amp; tamper demo</h3>
          {!payload ? (
            <div className="empty">Encrypt something first.</div>
          ) : (
            <>
              <div className="row-actions" style={{ flexWrap: "wrap", marginBottom: 14 }}>
                <button className="btn btn-primary btn-sm" onClick={onDecrypt} disabled={busy}>Decrypt</button>
                <button className="btn btn-danger btn-sm" onClick={() => tamper("ciphertext")}>Tamper ciphertext</button>
                <button className="btn btn-danger btn-sm" onClick={() => tamper("tag")}>Tamper tag</button>
              </div>
              <div className="hint" style={{ marginBottom: 12 }}>
                After tampering, click Decrypt — the backend's GCM authentication will fail (no plaintext returned).
              </div>
              {decrypted !== null && (
                <div className="result-banner ok">
                  <div className="rb-icon">✓</div>
                  <div>
                    <div className="rb-title">Decrypted &amp; authenticated</div>
                    <div className="rb-sub" style={{ wordBreak: "break-word" }}>{decrypted}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
