import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard, apiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHeader, StatCard, LoadingState, ErrorState, EmptyState, StatusChip, SeverityBadge, MiniBars } from "../components/ui";

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard().then((d) => setData(d)).catch((e) => setError(apiErrorMessage(e))).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const role = data.role as string;
  const m = (data.metrics ?? {}) as Record<string, number>;

  return (
    <>
      <PageHeader title="Welcome back," accent={user?.displayName ?? ""} subtitle="Your certificate security platform at a glance." />

      {role === "security_administrator" && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 18 }}>
            <StatCard label="Total Users" value={m.totalUsers} variant="g1" />
            <StatCard label="Active Accounts" value={m.activeUsers} variant="g2" />
            <StatCard label="MFA Adoption" value={`${m.mfaAdoption}%`} variant="g3" />
            <StatCard label="Open Incidents" value={m.openIncidents} variant="g4" />
          </div>
          <div className="grid cols-2">
            <div className="card chart-card">
              <h3 className="card-title">Top security event types</h3>
              <MiniBars data={((data.topEventTypes as { type: string; c: number }[]) ?? []).slice(0, 6).map((e) => ({ label: e.type.split("_")[0], value: e.c }))} />
            </div>
            <div className="card">
              <h3 className="card-title">Recent security events</h3>
              {((data.recentEvents as Record<string, unknown>[]) ?? []).length === 0 ? (
                <EmptyState title="No security events yet" hint="Events appear as the platform is used." />
              ) : (
                <div className="table-wrap"><table className="data"><thead><tr><th>Type</th><th>Severity</th><th>When</th></tr></thead>
                  <tbody>{(data.recentEvents as Record<string, unknown>[]).map((e, i) => (
                    <tr key={i}><td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(e.event_type)}</td>
                      <td><SeverityBadge severity={String(e.severity)} /></td>
                      <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(e.created_at)).toLocaleString()}</td></tr>
                  ))}</tbody></table></div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="flex-between"><h3 className="card-title">Quick actions</h3><Link className="btn btn-ghost btn-sm" to="/security">Security Operations →</Link></div>
            <div className="row-actions" style={{ flexWrap: "wrap" }}>
              <Link className="btn btn-primary" to="/users">Manage users</Link>
              <Link className="btn btn-ghost" to="/security/incidents">Incidents</Link>
              <Link className="btn btn-ghost" to="/security/simulations">Run a simulation</Link>
              <Link className="btn btn-ghost" to="/audit">Audit logs</Link>
            </div>
          </div>
        </>
      )}

      {role === "institution_issuer" && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 18 }}>
            <StatCard label="Total Certificates" value={m.totalCertificates} variant="g1" />
            <StatCard label="Active" value={m.activeCertificates} variant="g2" />
            <StatCard label="Revoked" value={m.revokedCertificates} variant="g3" />
            <StatCard label="Verification Activity" value={m.verificationActivity} variant="g4" />
          </div>
          <div className="card">
            <div className="flex-between"><h3 className="card-title">Recent certificates</h3><Link className="btn btn-ghost btn-sm" to="/registry">Registry →</Link></div>
            <RecentCerts rows={(data.recentCertificates as Record<string, unknown>[]) ?? []} />
          </div>
          <div className="card"><h3 className="card-title">Quick actions</h3>
            <div className="row-actions"><Link className="btn btn-primary" to="/register">Register a certificate</Link><Link className="btn btn-ghost" to="/registry">View registry</Link></div></div>
        </>
      )}

      {role === "company_verifier" && (
        <>
          <div className="grid cols-4" style={{ marginBottom: 18 }}>
            <StatCard label="Total Verifications" value={m.totalVerifications} variant="g1" />
            <StatCard label="Verified" value={m.verified} variant="g2" />
            <StatCard label="Document Mismatch" value={m.documentMismatch} variant="g3" />
            <StatCard label="Revoked" value={m.revoked} variant="g4" />
          </div>
          <div className="card"><h3 className="card-title">Recent verifications</h3>
            {((data.recentVerifications as Record<string, unknown>[]) ?? []).length === 0 ? (
              <EmptyState title="No verifications yet" hint="Verify a certificate to see history." />
            ) : (
              <div className="table-wrap"><table className="data"><thead><tr><th>Certificate</th><th>Result</th><th>When</th></tr></thead>
                <tbody>{(data.recentVerifications as Record<string, unknown>[]).map((e, i) => (
                  <tr key={i}><td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{String(e.certificateId ?? "—")}</td>
                    <td>{e.overall ? <StatusChip status={String(e.overall)} /> : "—"}</td>
                    <td style={{ color: "var(--text-3)", fontSize: 12 }}>{new Date(String(e.created_at)).toLocaleString()}</td></tr>
                ))}</tbody></table></div>
            )}
          </div>
          <div className="card"><h3 className="card-title">Quick actions</h3>
            <div className="row-actions"><Link className="btn btn-primary" to="/verify">Verify a certificate</Link></div></div>
        </>
      )}

      {role === "student" && (
        <>
          <div className="grid cols-3" style={{ marginBottom: 18 }}>
            <StatCard label="My Certificates" value={m.myCertificates} variant="g1" />
            <StatCard label="Active" value={m.activeCertificates} variant="g2" />
            <StatCard label="Revoked" value={m.revokedCertificates} variant="g3" />
          </div>
          <div className="card"><h3 className="card-title">My certificates</h3>
            <RecentCerts rows={(data.certificates as Record<string, unknown>[]) ?? []} />
          </div>
        </>
      )}
    </>
  );
}

function RecentCerts({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <EmptyState title="No certificates yet" />;
  return (
    <div className="table-wrap"><table className="data"><thead><tr><th>Certificate ID</th><th>Qualification</th><th>Status</th></tr></thead>
      <tbody>{rows.map((c, i) => (
        <tr key={i}>
          <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            <Link to={`/certificates/${encodeURIComponent(String(c.certificate_id))}`}>{String(c.certificate_id)}</Link>
          </td>
          <td>{String(c.qualification)}</td>
          <td><StatusChip status={String(c.status)} /></td>
        </tr>
      ))}</tbody></table></div>
  );
}
