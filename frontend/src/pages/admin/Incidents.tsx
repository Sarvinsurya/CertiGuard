import { useEffect, useState, useCallback } from "react";
import {
  fetchIncidents, createIncidentApi, fetchIncident, incidentAction, resolveIncident,
  reverseIncidentAction, fetchUsers, apiErrorMessage,
} from "../../api/client";
import { PageHeader, LoadingState, EmptyState, SeverityBadge, StatusChip, useToast } from "../../components/ui";

const ACTIONS = [
  { value: "flag_review", label: "Flag for review" },
  { value: "throttle", label: "Throttle account" },
  { value: "revoke_sessions", label: "Revoke sessions" },
  { value: "require_password_reset", label: "Require password reset" },
  { value: "require_mfa", label: "Require MFA re-verification" },
  { value: "suspend", label: "Suspend account (temporary)" },
];

export function Incidents() {
  const toast = useToast();
  const [incidents, setIncidents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<{ incident: Record<string, unknown>; actions: Record<string, unknown>[] } | null>(null);
  const [users, setUsers] = useState<{ id: number; email: string }[]>([]);
  const [form, setForm] = useState({ title: "", description: "", severity: "medium" });
  const [action, setAction] = useState({ actionType: "flag_review", targetUserId: 0, reason: "", durationSeconds: 3600 });

  const load = useCallback(async () => {
    setLoading(true);
    try { setIncidents((await fetchIncidents()).incidents); } catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); fetchUsers().then((u) => setUsers(u.users.map((x) => ({ id: x.id, email: x.email })))).catch(() => {}); }, [load]);

  async function create() {
    try { await createIncidentApi(form); toast.push("success", "Incident created."); setShowCreate(false); setForm({ title: "", description: "", severity: "medium" }); load(); }
    catch (e) { toast.push("error", apiErrorMessage(e)); }
  }
  async function open(id: number) { try { setSelected(await fetchIncident(id)); } catch (e) { toast.push("error", apiErrorMessage(e)); } }
  async function applyAction() {
    if (!selected) return;
    try {
      const r = await incidentAction(Number(selected.incident.id), action);
      toast.push("success", `Action applied: ${String((r.result as Record<string, unknown>).effect)}`);
      await open(Number(selected.incident.id)); load();
    } catch (e) { toast.push("error", apiErrorMessage(e)); }
  }
  async function resolve() { if (!selected) return; try { await resolveIncident(Number(selected.incident.id)); toast.push("success", "Resolved."); setSelected(null); load(); } catch (e) { toast.push("error", apiErrorMessage(e)); } }
  async function reverse(actionId: number) { try { await reverseIncidentAction(actionId); toast.push("success", "Action reversed."); if (selected) open(Number(selected.incident.id)); } catch (e) { toast.push("error", apiErrorMessage(e)); } }

  return (
    <>
      <PageHeader title="Incident" accent="Management" subtitle="Safe, reversible response actions — never destructive."
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New incident</button>} />
      <div className="card">
        {loading ? <LoadingState /> : incidents.length === 0 ? <EmptyState title="No incidents" hint="Create one or let detection raise them." /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Title</th><th>Severity</th><th>Status</th><th>Risk</th><th>Created</th><th></th></tr></thead>
            <tbody>{incidents.map((i) => (
              <tr key={String(i.id)}>
                <td>{String(i.title)}</td><td><SeverityBadge severity={String(i.severity)} /></td>
                <td><StatusChip status={String(i.status) === "resolved" ? "VERIFIED" : String(i.status) === "false_positive" ? "NOT_CHECKED" : "warn"} /></td>
                <td>{String(i.risk_score)}</td>
                <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(i.created_at)).toLocaleString()}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => open(Number(i.id))}>Open</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title">Create incident</h3>
            <div className="field"><label>Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>Description</label><textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="field"><label>Severity</label><select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{["low", "medium", "high", "critical"].map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="row-actions" style={{ justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn btn-primary btn-sm" onClick={create}>Create</button></div>
          </div>
        </div>
      )}

      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="flex-between"><h3 className="card-title">{String(selected.incident.title)}</h3><button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>Close</button></div>
            <p className="card-desc">{String(selected.incident.description)}</p>
            <div className="flex" style={{ gap: 10, marginBottom: 16 }}><SeverityBadge severity={String(selected.incident.severity)} /><span className="chip muted">{String(selected.incident.status)}</span></div>

            <h4 className="card-title" style={{ fontSize: 14 }}>Apply response action</h4>
            <div className="field"><label>Action</label><select className="select" value={action.actionType} onChange={(e) => setAction({ ...action, actionType: e.target.value })}>{ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
            <div className="field"><label>Target user</label><select className="select" value={action.targetUserId} onChange={(e) => setAction({ ...action, targetUserId: Number(e.target.value) })}>
              <option value={0}>Select…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select></div>
            <div className="field"><label>Reason</label><input className="input" value={action.reason} onChange={(e) => setAction({ ...action, reason: e.target.value })} /></div>
            <div className="row-actions"><button className="btn btn-primary btn-sm" disabled={!action.targetUserId || !action.reason} onClick={applyAction}>Apply action</button>
              <button className="btn btn-ghost btn-sm" onClick={resolve}>Resolve incident</button></div>

            <h4 className="card-title" style={{ fontSize: 14, marginTop: 20 }}>Actions taken</h4>
            {selected.actions.length === 0 ? <div className="empty">None yet.</div> : (
              <div className="table-wrap"><table className="data"><thead><tr><th>Action</th><th>Target</th><th>Status</th><th></th></tr></thead>
                <tbody>{selected.actions.map((a) => (
                  <tr key={String(a.id)}><td>{String(a.action_type)}</td><td>user:{String(a.target_id)}</td>
                    <td>{a.reversed_at ? <span className="chip muted">reversed</span> : <span className="chip ok">active</span>}</td>
                    <td>{!a.reversed_at && <button className="btn btn-ghost btn-sm" onClick={() => reverse(Number(a.id))}>Reverse</button>}</td></tr>
                ))}</tbody></table></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
