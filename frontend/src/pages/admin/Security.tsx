import { useEffect, useState, useCallback } from "react";
import {
  fetchSecuritySummary, fetchSecurityEvents, fetchRules, fetchRisk, apiErrorMessage,
} from "../../api/client";
import { PageHeader, StatCard, LoadingState, EmptyState, SeverityBadge, RiskIndicator, MiniBars } from "../../components/ui";

export function SecurityOverview() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [highRisk, setHighRisk] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSecuritySummary().then((d) => { setSummary(d.summary); setHighRisk(d.highRisk as Record<string, unknown>[]); })
      .catch((e) => setError(apiErrorMessage(e))).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <div className="alert error">{error}</div>;
  const s = summary ?? {};
  const bySeverity = (s.bySeverity as { severity: string; c: number }[]) ?? [];
  const byType = (s.byType as { type: string; c: number }[]) ?? [];

  return (
    <>
      <PageHeader title="Security" accent="Overview" subtitle="Live metrics computed from recorded security events (last 7 days)." />
      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        <StatCard label="Security Events" value={Number(s.total ?? 0)} variant="g1" />
        <StatCard label="High-risk Accounts" value={highRisk.length} variant="g2" />
        <StatCard label="Open Incidents" value={Number(s.openIncidents ?? 0)} variant="g3" />
        <StatCard label="Resolved Incidents" value={Number(s.resolvedIncidents ?? 0)} variant="g4" />
      </div>
      <div className="grid cols-2">
        <div className="card chart-card"><h3 className="card-title">Events by type</h3>
          {byType.length ? <MiniBars data={byType.slice(0, 6).map((t) => ({ label: t.type.split("_")[0], value: t.c }))} /> : <EmptyState title="No events yet" />}</div>
        <div className="card"><h3 className="card-title">Events by severity</h3>
          {bySeverity.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {bySeverity.map((b) => (<div key={b.severity} className="flex-between"><SeverityBadge severity={b.severity} /><b>{b.c}</b></div>))}
            </div>
          ) : <EmptyState title="No events yet" />}</div>
      </div>
      <div className="card"><h3 className="card-title">High-risk subjects</h3>
        {highRisk.length === 0 ? <EmptyState title="No high-risk subjects" hint="Risk is assessed from recorded security events." /> : (
          <div className="table-wrap"><table className="data"><thead><tr><th>Subject</th><th>Type</th><th>Risk</th><th>Assessed</th></tr></thead>
            <tbody>{highRisk.map((r, i) => (
              <tr key={i}><td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(r.subject_id)}</td><td>{String(r.subject_type)}</td>
                <td style={{ width: 200 }}><RiskIndicator score={Number(r.score)} level={String(r.level)} /></td>
                <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(r.assessed_at)).toLocaleString()}</td></tr>
            ))}</tbody></table></div>
        )}
      </div>
    </>
  );
}

export function SecurityEvents() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await fetchSecurityEvents({ severity: severity || undefined, search: search || undefined, limit, offset }); setEvents(d.events); setTotal(d.total); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [severity, search, offset]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      <PageHeader title="Security" accent="Events" subtitle="Every event is produced by real application activity." />
      <div className="toolbar">
        <input className="input" placeholder="Search type / rule / resource…" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value); }} />
        <select className="select" value={severity} onChange={(e) => { setOffset(0); setSeverity(e.target.value); }}>
          <option value="">All severities</option>{["info", "low", "medium", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="card">
        {loading ? <LoadingState /> : events.length === 0 ? <EmptyState title="No security events" hint="Events appear as the platform is used." /> : (
          <>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Type</th><th>Severity</th><th>Rule</th><th>Resource</th><th>Risk</th><th>When</th></tr></thead>
              <tbody>{events.map((e, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(e.event_type)}</td>
                  <td><SeverityBadge severity={String(e.severity)} /></td>
                  <td style={{ fontSize: 12 }}>{String(e.detection_rule ?? "—")}</td>
                  <td style={{ fontSize: 12 }}>{String(e.resource_id ?? "—")}</td>
                  <td>{String(e.risk_contribution ?? 0)}</td>
                  <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(e.created_at)).toLocaleString()}</td>
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

export function RiskMonitoring() {
  const [risk, setRisk] = useState<Record<string, unknown>[]>([]);
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchRisk(), fetchRules()]).then(([r, ru]) => { setRisk(r.highRisk); setRules(ru.rules); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  return (
    <>
      <PageHeader title="Risk" accent="Monitoring" subtitle="Transparent, rule-based risk scoring (0–100). A heuristic score is a signal, not proof of an attack." />
      <div className="card"><h3 className="card-title">Risk assessments</h3>
        {risk.length === 0 ? <EmptyState title="No risk assessments yet" /> : (
          <div className="table-wrap"><table className="data"><thead><tr><th>Subject</th><th>Type</th><th>Risk</th><th>Assessed</th></tr></thead>
            <tbody>{risk.map((r, i) => (
              <tr key={i}><td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(r.subject_id)}</td><td>{String(r.subject_type)}</td>
                <td style={{ width: 200 }}><RiskIndicator score={Number(r.score)} level={String(r.level)} /></td>
                <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(r.assessed_at)).toLocaleString()}</td></tr>
            ))}</tbody></table></div>
        )}
      </div>
      <div className="card"><h3 className="card-title">Detection rules &amp; weights</h3>
        <div className="table-wrap"><table className="data"><thead><tr><th>Rule</th><th>Description</th><th>Threshold</th><th>Window</th><th>Severity</th><th>Weight</th></tr></thead>
          <tbody>{rules.map((r, i) => (
            <tr key={i}><td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{String(r.id)}</td><td style={{ fontSize: 13 }}>{String(r.description)}</td>
              <td>{String(r.threshold)}</td><td>{String(r.windowSeconds)}s</td><td><SeverityBadge severity={String(r.severity)} /></td><td>{String(r.riskWeight)}</td></tr>
          ))}</tbody></table></div>
      </div>
    </>
  );
}
