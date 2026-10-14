import { useEffect, useState } from "react";
import {
  privacyMinimize,
  privacyMinimizationSample,
  apiErrorMessage,
  type MinimizationResult,
} from "../../api/client";
import { LabIntro } from "../../components/LabIntro";

const OPS = [
  { value: "verification", label: "Certificate verification" },
  { value: "publicStatus", label: "Public status lookup" },
  { value: "maskedDisplay", label: "Masked display" },
  { value: "fullAdmin", label: "Full admin view (prototype)" },
];

export function MinimizationLab() {
  const [operation, setOperation] = useState("verification");
  const [sample, setSample] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<MinimizationResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    privacyMinimizationSample().then((r) => setSample(r.record)).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function run() {
    setError(""); setBusy(true);
    try { setResult(await privacyMinimize(operation)); }
    catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <LabIntro
        title="Data Minimization" accent="Lab"
        what="Returns only the fields an operation actually needs — nothing more."
        why="Less data exposed means less privacy risk if a response is intercepted, logged, or leaked."
        how="Separate backend serializers with explicit field allowlists. Raw DB rows are never returned directly."
        limitations="'Necessary' is a policy decision. This demo uses a synthetic record; the production verification contract is unchanged."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h3 className="card-title">Full synthetic record</h3>
          {!sample ? <div className="loading">Loading…</div> : (
            <dl className="kv">
              {Object.entries(sample).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd style={{ wordBreak: "break-all" }}>{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Choose an operation</h3>
          <div className="field">
            <label>Operation</label>
            <select className="select" value={operation} onChange={(e) => setOperation(e.target.value)}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={run} disabled={busy}>Minimize</button>

          {result && (
            <div style={{ marginTop: 16 }}>
              <div className="flex" style={{ gap: 10, marginBottom: 12 }}>
                <span className="chip info">Full: {result.fullFieldCount} fields</span>
                <span className="chip ok">Response: {result.responseFieldCount} fields</span>
                <span className="chip warn">Excluded: {result.excludedFields.length}</span>
              </div>
              <div className="cr-desc">Minimized response</div>
              <div className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.response, null, 2)}</div>
            </div>
          )}
        </div>
      </div>

      {result && result.excludedFields.length > 0 && (
        <div className="card">
          <h3 className="card-title">Excluded fields &amp; reasons</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Field</th><th>Reason for exclusion</th></tr></thead>
              <tbody>
                {result.excludedFields.map((f) => (
                  <tr key={f}><td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{f}</td><td>{result.exclusionReasons[f]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
