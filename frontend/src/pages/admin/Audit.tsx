import { useEffect, useState, useCallback } from "react";
import { fetchAudit, fetchAuditIntegrity, auditExportUrl, apiErrorMessage } from "../../api/client";
import { PageHeader, LoadingState, EmptyState, useToast } from "../../components/ui";

export function AuditLogs() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await fetchAudit({ search: search || undefined, action: action || undefined, limit, offset }); setEvents(d.events); setTotal(d.total); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [search, action, offset]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      <PageHeader title="Audit" accent="Logs" subtitle="Append-only, hash-chained record of important actions (legitimate or not)."
        actions={<a className="btn btn-ghost btn-sm" href={auditExportUrl()}>Export CSV</a>} />
      <div className="toolbar">
        <input className="input" placeholder="Search action / target / outcome…" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value); }} />
        <input className="input" placeholder="Filter by action…" value={action} onChange={(e) => { setOffset(0); setAction(e.target.value); }} />
      </div>
      <div className="card">
        {loading ? <LoadingState /> : events.length === 0 ? <EmptyState title="No audit records" /> : (
          <>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Resource</th><th>Outcome</th></tr></thead>
              <tbody>{events.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(e.created_at)).toLocaleString()}</td>
                  <td>{e.actor_id ? `#${String(e.actor_id)}` : "system"}</td>
                  <td style={{ fontSize: 12 }}>{String(e.actor_role ?? "—")}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(e.action)}</td>
                  <td style={{ fontSize: 12 }}>{String(e.target ?? "—")}</td>
                  <td>{String(e.outcome)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="pager">
              <span style={{ color: "var(--text-3)", fontSize: 12 }}>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
              <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
              <button className="btn btn-ghost btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function AuditIntegrity() {
  const toast = useToast();
  const [result, setResult] = useState<{ ok: boolean; checked: number; message: string; firstBrokenId: number | null } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try { setResult((await fetchAuditIntegrity()).integrity); } catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setLoading(false); }
  }
  useEffect(() => { run(); }, []);

  return (
    <>
      <PageHeader title="Audit" accent="Integrity" subtitle="Independently re-verify the audit hash chain."
        actions={<button className="btn btn-primary btn-sm" onClick={run} disabled={loading}>{loading ? <span className="spinner" /> : "Re-verify"}</button>} />
      <div className="card">
        {!result ? <LoadingState /> : (
          <div className={`result-banner ${result.ok ? "ok" : "danger"}`}>
            <div className="rb-icon">{result.ok ? "⛓" : "✕"}</div>
            <div><div className="rb-title">{result.ok ? "Chain intact" : "Chain broken"}</div><div className="rb-sub">{result.message}</div></div>
          </div>
        )}
        <div className="alert info" style={{ marginTop: 14 }}>
          Hash chaining makes casual/partial tampering detectable. It does <b>not</b> make the log absolutely immutable — a privileged database operator could recompute the whole chain. For stronger guarantees, anchor the head hash externally.
        </div>
      </div>
    </>
  );
}
