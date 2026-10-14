import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchHealth, fetchDashboard, fetchAuditIntegrity, apiErrorMessage } from "../api/client";
import { PageHeader, LoadingState, EmptyState, StatusChip } from "../components/ui";

export function Profile() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title="My" accent="Profile" />
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="flex" style={{ gap: 14, marginBottom: 18 }}>
          <span className="avatar" style={{ width: 54, height: 54, fontSize: 20 }}>{user.displayName.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{user.displayName}</div><div style={{ color: "var(--text-2)" }}>{user.email}</div></div>
        </div>
        <dl className="kv">
          <dt>Role</dt><dd style={{ textTransform: "capitalize" }}>{user.role.replace(/_/g, " ")}</dd>
          <dt>Organization</dt><dd>{user.organizationName ?? "—"}</dd>
          <dt>MFA</dt><dd>{user.mfaEnabled ? "Enabled" : "Disabled"}</dd>
          <dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
        </dl>
        <Link className="btn btn-ghost btn-sm" to="/account" style={{ marginTop: 12 }}>Manage account security →</Link>
      </div>
    </>
  );
}

export function Settings() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Platform" accent="Settings" subtitle="Environment and configuration overview." />
      <div className="card">
        <dl className="kv">
          <dt>Signed-in role</dt><dd style={{ textTransform: "capitalize" }}>{user?.role.replace(/_/g, " ")}</dd>
          <dt>Session</dt><dd>Server-managed, HttpOnly cookie, CSRF-protected</dd>
          <dt>Password hashing</dt><dd>scrypt (memory-hard)</dd>
          <dt>MFA</dt><dd>TOTP (RFC 6238), encrypted secret at rest</dd>
          <dt>Data store</dt><dd>SQLite (single-instance). See deployment notes for scaling.</dd>
        </dl>
      </div>
    </>
  );
}

export function PlatformHealth() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [integrity, setIntegrity] = useState<{ ok: boolean; checked: number } | null>(null);
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchHealth(), fetchAuditIntegrity().catch(() => null), fetchDashboard().catch(() => null)])
      .then(([h, i, d]) => { setHealth(h as Record<string, unknown>); setIntegrity(i?.integrity ?? null); setDash(d); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  const m = (dash?.metrics ?? {}) as Record<string, number>;
  return (
    <>
      <PageHeader title="Platform" accent="Health" subtitle="System status computed from live backend data." />
      <div className="grid cols-3">
        <div className="card"><h3 className="card-title">Service</h3>
          <dl className="kv"><dt>Status</dt><dd><span className="chip ok">{String(health?.status ?? "ok")}</span></dd>
            <dt>DB schema</dt><dd>v{String(health?.schemaVersion ?? "—")}</dd>
            <dt>Checked</dt><dd>{health?.time ? new Date(String(health.time)).toLocaleTimeString() : "—"}</dd></dl>
        </div>
        <div className="card"><h3 className="card-title">Audit chain</h3>
          {integrity ? (
            <dl className="kv"><dt>Integrity</dt><dd>{integrity.ok ? <span className="chip ok">intact</span> : <span className="chip danger">broken</span>}</dd>
              <dt>Entries checked</dt><dd>{integrity.checked}</dd></dl>
          ) : <EmptyState title="Integrity not available for this role" />}
        </div>
        <div className="card"><h3 className="card-title">Security posture</h3>
          <dl className="kv"><dt>Open incidents</dt><dd>{m.openIncidents ?? "—"}</dd>
            <dt>High-risk accounts</dt><dd>{m.highRiskAccounts ?? "—"}</dd>
            <dt>MFA adoption</dt><dd>{m.mfaAdoption != null ? `${m.mfaAdoption}%` : "—"}</dd></dl>
        </div>
      </div>
      <div className="alert info">SQLite is suitable for a single-instance demonstration. For production scale, migrate to a managed database and use a shared rate-limit store (see deployment documentation).</div>
    </>
  );
}

export function MyCertificates() {
  const [certs, setCerts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard().then((d) => setCerts((d.certificates as Record<string, unknown>[]) ?? [])).catch((e) => setError(apiErrorMessage(e))).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <div className="alert error">{error}</div>;
  return (
    <>
      <PageHeader title="My" accent="Certificates" subtitle="Certificates issued to you." />
      <div className="card">
        {certs.length === 0 ? <EmptyState title="No certificates yet" /> : (
          <div className="table-wrap"><table className="data"><thead><tr><th>Certificate ID</th><th>Qualification</th><th>Institution</th><th>Issued</th><th>Status</th></tr></thead>
            <tbody>{certs.map((c, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}><Link to={`/certificates/${encodeURIComponent(String(c.certificate_id))}`}>{String(c.certificate_id)}</Link></td>
                <td>{String(c.qualification)}</td><td>{String(c.institution_name)}</td>
                <td>{String(c.issue_date)}</td><td><StatusChip status={String(c.status)} /></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </div>
    </>
  );
}
