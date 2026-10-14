import { useState } from "react";
import { signatureDemo, apiErrorMessage, type SignatureDemoResult } from "../api/client";

const defaultRecord = {
  certificateId: "LAB-DEMO-0001",
  studentName: "Demo Student",
  studentIdentifier: "LAB-STU-0001",
  institutionName: "CertiGuard Demonstration University",
  qualification: "B.Tech Computer Science",
  graduationYear: 2024,
  issueDate: "2024-06-01",
  documentHash: "0".repeat(64),
};

export function SignatureLab() {
  const [tamperField, setTamperField] = useState<"studentName" | "qualification" | "documentHash">("studentName");
  const [tamperValue, setTamperValue] = useState("Tampered Student");
  const [result, setResult] = useState<SignatureDemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(withTamper: boolean) {
    setError("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { record: defaultRecord };
      if (withTamper) {
        payload.tamperedRecord = { ...defaultRecord, [tamperField]: tamperValue };
      }
      setResult(await signatureDemo(payload));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Digital <span className="accent">Signature Lab</span></h1>
        <p className="page-sub">
          Real Ed25519 signing on the backend, isolated from registered certificates. Sign a
          test record, then tamper one signed field and verify the original signature against
          it. The private key is never exposed.
        </p>
      </div>

      {error && <div className="alert error">{error}</div>}
      <div className="alert info">
        A valid signature establishes <b>integrity</b> and <b>possession of the signing key</b>.
        Trust in the issuer additionally depends on securely binding the issuer to its public key.
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3 className="card-title">Test record (signed)</h3>
          <p className="card-desc">These fields are canonicalized and signed. This lab does not touch real records.</p>
          <dl className="kv">
            {Object.entries(defaultRecord).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd style={{ fontFamily: k === "documentHash" ? "var(--mono)" : "inherit", fontSize: k === "documentHash" ? 12 : 14, wordBreak: "break-all" }}>{String(v)}</dd>
              </div>
            ))}
          </dl>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => run(false)} disabled={busy}>
            {busy ? "Signing…" : "Sign & verify (normal)"}
          </button>
        </div>

        <div className="card">
          <h3 className="card-title">Tamper demonstration</h3>
          <p className="card-desc">Change one signed field, then verify the original signature against the tampered record.</p>
          <div className="field">
            <label>Field to tamper</label>
            <select className="select" value={tamperField} onChange={(e) => setTamperField(e.target.value as typeof tamperField)}>
              <option value="studentName">studentName</option>
              <option value="qualification">qualification</option>
              <option value="documentHash">documentHash</option>
            </select>
          </div>
          <div className="field">
            <label>New (tampered) value</label>
            <input className="input" value={tamperValue} onChange={(e) => setTamperValue(e.target.value)} />
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => run(true)} disabled={busy}>
            {busy ? "Running…" : "Sign original, verify against tampered"}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <h3 className="card-title">Result</h3>
          <div className={`result-banner ${result.originalVerified ? "ok" : "danger"}`}>
            <div className="rb-icon">{result.originalVerified ? "✓" : "✕"}</div>
            <div>
              <div className="rb-title">Original record: {result.originalVerified ? "signature VALID" : "signature INVALID"}</div>
              <div className="rb-sub">Signed with the issuer Ed25519 key ({result.issuerCode}) and verified with its public key.</div>
            </div>
          </div>

          {result.tampered && (
            <div className={`result-banner ${result.tampered.verified ? "ok" : "danger"}`}>
              <div className="rb-icon">{result.tampered.verified ? "✓" : "✕"}</div>
              <div>
                <div className="rb-title">Tampered record: signature {result.tampered.verified ? "VALID" : "INVALID"}</div>
                <div className="rb-sub">{result.tampered.explanation}</div>
              </div>
            </div>
          )}

          <div className="cr-desc" style={{ margin: "12px 0 4px" }}>Canonical string (signed)</div>
          <div className="mono" style={{ whiteSpace: "pre-wrap" }}>{result.canonical}</div>
          <div className="cr-desc" style={{ margin: "12px 0 4px" }}>Signature (base64)</div>
          <div className="mono">{result.signature}</div>

          {result.tampered && (
            <>
              <div className="cr-desc" style={{ margin: "12px 0 4px" }}>Tampered canonical string</div>
              <div className="mono" style={{ whiteSpace: "pre-wrap" }}>{result.tampered.canonical}</div>
            </>
          )}
        </div>
      )}
    </>
  );
}
