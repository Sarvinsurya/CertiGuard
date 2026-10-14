import { useEffect, useState } from "react";
import { fetchSimulations, runSimulationApi, apiErrorMessage } from "../../api/client";
import { PageHeader, LoadingState, EmptyState, useToast } from "../../components/ui";

export function Simulations() {
  const toast = useToast();
  const [scenarios, setScenarios] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { fetchSimulations().then((d) => setScenarios(d.scenarios)).catch(() => {}).finally(() => setLoading(false)); }, []);

  async function run(id: string) {
    setRunning(id); setResult(null);
    try { const r = await runSimulationApi(id); setResult(r.result); toast.push("success", "Simulation completed against the live backend."); }
    catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setRunning(null); }
  }

  if (loading) return <LoadingState />;

  return (
    <>
      <PageHeader title="Security" accent="Simulations" subtitle="Controlled scenarios send real requests through the live middleware and event pipeline — results are measured, not fabricated." />
      <div className="alert info">Simulations use synthetic markers, conservative request counts, and only target this backend's own test endpoint. They never affect real certificate records.</div>
      <div className="grid cols-2">
        {scenarios.length === 0 ? <EmptyState title="No scenarios available" /> : scenarios.map((s) => (
          <div className="card" key={String(s.id)}>
            <h3 className="card-title">{String(s.label)}</h3>
            <p className="card-desc">Emits <b>{String(s.count)}</b> synthetic <span className="mono" style={{ display: "inline" }}>{String(s.eventType)}</span> events.</p>
            <button className="btn btn-primary btn-sm" disabled={running === s.id} onClick={() => run(String(s.id))}>
              {running === s.id ? <span className="spinner" /> : "Run simulation"}
            </button>
          </div>
        ))}
      </div>

      {result && (
        <div className="card">
          <h3 className="card-title">Result — {String(result.label)}</h3>
          <div className="grid cols-4" style={{ marginBottom: 14 }}>
            <div className="kpi g1"><div className="kpi-label">Requests</div><div className="kpi-value">{String(result.requestsAttempted)}</div></div>
            <div className="kpi g2"><div className="kpi-label">Accepted</div><div className="kpi-value">{String(result.requestsAccepted)}</div></div>
            <div className="kpi g3"><div className="kpi-label">HTTP 429</div><div className="kpi-value">{String(result.http429)}</div></div>
            <div className="kpi g4"><div className="kpi-label">Events</div><div className="kpi-value">{String(result.eventsGenerated)}</div></div>
          </div>
          <div className="cr-desc">Triggered detection rules</div>
          <div className="flex" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {((result.triggeredRuleIds as string[]) ?? []).length === 0 ? <span className="chip muted">none</span> : (result.triggeredRuleIds as string[]).map((r) => <span key={r} className="chip warn">{r}</span>)}
          </div>
          <div className="cr-desc" style={{ marginTop: 12 }}>Resulting risk assessment</div>
          <div className="mono" style={{ marginTop: 6 }}>{JSON.stringify((result.riskAssessment as Record<string, unknown>) ?? {}, null, 2)}</div>
        </div>
      )}
    </>
  );
}
