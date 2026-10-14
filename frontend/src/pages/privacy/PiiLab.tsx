import { useState } from "react";
import { privacyDetectPii, apiErrorMessage, type PiiResult } from "../../api/client";
import { LabIntro } from "../../components/LabIntro";

const SAMPLE =
  "Student Aarav Sharma (ID CGDU-STU-2024-0001) can be reached at aarav.sharma@example.edu or 9876543210. DOB 14/03/2002. PAN ABCDE1234F. The quick brown fox is not PII.";

const confChip: Record<string, string> = { high: "ok", medium: "warn", low: "muted" };

export function PiiLab() {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<PiiResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setError(""); setBusy(true);
    try { setResult(await privacyDetectPii(text)); }
    catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <LabIntro
        title="PII Detection" accent="Lab"
        what="Finds personally identifiable information (emails, phones, IDs, DOB, PAN/Aadhaar, name/address heuristics) in text."
        why="You must know where sensitive data is before you can mask, minimize, or protect it."
        how="A modular backend service applies configurable regular expressions and light contextual rules. Processing is fully local — nothing is sent to external services."
        limitations="Pattern-based: expect false positives/negatives. Names/addresses are LOW-confidence heuristics. Not a trained NER model."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="field">
          <label>Text to scan (synthetic)</label>
          <textarea className="textarea" style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy || !text}>Detect PII</button>
      </div>

      {result && (
        <>
          <div className="card">
            <h3 className="card-title">Counts by category</h3>
            {Object.keys(result.countsByCategory).length === 0 ? (
              <div className="empty">No PII detected (above low-confidence noise).</div>
            ) : (
              <div className="flex" style={{ flexWrap: "wrap", gap: 10 }}>
                {Object.entries(result.countsByCategory).map(([cat, n]) => (
                  <span key={cat} className="chip info">{cat}: {n}</span>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Detections ({result.matches.length})</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Category</th><th>Value</th><th>Location</th><th>Confidence</th><th>Method</th></tr>
                </thead>
                <tbody>
                  {result.matches.map((m, i) => (
                    <tr key={i}>
                      <td>{m.category}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{m.value}</td>
                      <td>{m.start}–{m.end}</td>
                      <td><span className={`chip ${confChip[m.confidence]}`}>{m.confidence}</span></td>
                      <td style={{ color: "var(--text-3)", fontSize: 12 }}>{m.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="alert info" style={{ marginTop: 14 }}>{result.limitations}</div>
          </div>
        </>
      )}
    </>
  );
}
