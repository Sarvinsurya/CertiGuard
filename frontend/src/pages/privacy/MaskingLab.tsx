import { useState } from "react";
import { privacyMask, apiErrorMessage, type MaskFieldInput, type MaskFieldResult } from "../../api/client";
import { LabIntro } from "../../components/LabIntro";

const STRATEGIES = ["email", "phone", "id", "name", "full", "partial"] as const;

const DEFAULTS: MaskFieldInput[] = [
  { field: "Email", value: "student@example.com", strategy: "email" },
  { field: "Phone", value: "9876543210", strategy: "phone" },
  { field: "Student ID", value: "STU202612345", strategy: "id" },
  { field: "Name", value: "Aarav Sharma", strategy: "name" },
];

export function MaskingLab() {
  const [fields, setFields] = useState<MaskFieldInput[]>(DEFAULTS);
  const [results, setResults] = useState<MaskFieldResult[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(i: number, patch: Partial<MaskFieldInput>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function run() {
    setError(""); setBusy(true);
    try { setResults((await privacyMask(fields)).results); }
    catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <LabIntro
        title="Data Masking" accent="Lab"
        what="Replaces characters of sensitive values with * for display, keeping just enough to be recognizable."
        why="Reduces exposure of PII in UIs and selected API responses without storing or transmitting the full value."
        how="Reusable backend masking functions apply per-field strategies at the response boundary. The original input is never mutated."
        limitations="Masking is NOT encryption and is irreversible. Access control (roles & permissions) governs who sees unmasked data; masking is a presentation-boundary control."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h3 className="card-title">Fields (synthetic)</h3>
        {fields.map((f, i) => (
          <div className="grid cols-3" key={i} style={{ marginBottom: 12, alignItems: "end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>{f.field}</label>
              <input className="input" value={f.value} onChange={(e) => update(i, { value: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Strategy</label>
              <select className="select" value={f.strategy} onChange={(e) => update(i, { strategy: e.target.value as MaskFieldInput["strategy"] })}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {f.strategy === "partial" && (
              <div className="field" style={{ margin: 0 }}>
                <label>Visible chars</label>
                <input className="input" type="number" value={f.visible ?? 4} onChange={(e) => update(i, { visible: Number(e.target.value) })} />
              </div>
            )}
          </div>
        ))}
        <button className="btn btn-primary" onClick={run} disabled={busy}>Mask fields</button>
      </div>

      {results && (
        <div className="card">
          <h3 className="card-title">Original vs masked</h3>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Field</th><th>Original</th><th>Masked</th><th>Strategy</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{r.field}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.original}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--violet-soft)" }}>{r.masked}</td>
                    <td>{r.strategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="alert info" style={{ marginTop: 14 }}>
            Correct masking balances usability and exposure. "full" over-masks (unusable); too many visible characters under-masks (reveals too much).
          </div>
        </div>
      )}
    </>
  );
}
