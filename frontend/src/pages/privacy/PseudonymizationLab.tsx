import { useState } from "react";
import { privacyPseudonymize, apiErrorMessage, type PseudonymResult } from "../../api/client";
import { LabIntro } from "../../components/LabIntro";

interface Row extends PseudonymResult { identifier: string; }

export function PseudonymizationLab() {
  const [identifier, setIdentifier] = useState("STU202612345");
  const [scope, setScope] = useState("default");
  const [keyVersion, setKeyVersion] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [plainDemo, setPlainDemo] = useState<{ value: string; warning: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setError(""); setBusy(true);
    try {
      const r = await privacyPseudonymize({ identifier, scope, keyVersion, includePlainHashDemo: true });
      setRows((prev) => [{ ...r, identifier }, ...prev].slice(0, 8));
      setPlainDemo(r.plainHashDemo ?? null);
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <LabIntro
        title="Pseudonymization" accent="Lab"
        what="Replaces a direct identifier with a stable pseudonym like PG-7F39A12C that does not reveal the original."
        why="Lets systems correlate records (e.g., audit logs) without exposing real identifiers."
        how="Keyed HMAC-SHA256 on the backend with domain separation by scope + key version. The secret key never leaves the server."
        limitations="Pseudonymization is NOT anonymization — the link can be re-established with the key. Rotating the key version changes all pseudonyms."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="grid cols-3">
          <div className="field"><label>Identifier (synthetic)</label>
            <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>
          <div className="field"><label>Scope</label>
            <input className="input" value={scope} onChange={(e) => setScope(e.target.value)} /></div>
          <div className="field"><label>Key version</label>
            <input className="input" type="number" value={keyVersion} onChange={(e) => setKeyVersion(Number(e.target.value))} /></div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy || !identifier}>Generate pseudonym</button>
        <div className="hint" style={{ marginTop: 10 }}>
          Try the same identifier twice (consistent), then change the scope or key version (different), then change the identifier (different).
        </div>
      </div>

      {plainDemo && (
        <div className="alert error">
          <b>Why not plain SHA-256?</b> Keyless hash of this identifier = <span style={{ fontFamily: "var(--mono)" }}>{plainDemo.value}</span>. {plainDemo.warning}
        </div>
      )}

      {rows.length > 0 && (
        <div className="card">
          <h3 className="card-title">Results (most recent first)</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Identifier</th><th>Scope</th><th>Key v</th><th>Pseudonym</th><th>Method</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.identifier}</td>
                    <td>{r.scope}</td>
                    <td>{r.keyVersion}</td>
                    <td style={{ fontFamily: "var(--mono)", color: "var(--violet-soft)" }}>{r.pseudonym}</td>
                    <td style={{ color: "var(--text-3)", fontSize: 12 }}>{r.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
