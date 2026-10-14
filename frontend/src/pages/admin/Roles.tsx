import { PageHeader } from "../../components/ui";

const ROLE_MATRIX: { role: string; label: string; perms: string[] }[] = [
  { role: "institution_issuer", label: "Institution Issuer", perms: ["certificate.register", "certificate.view", "certificate.revoke", "certificate.download", "certificate.verify", "privacy.use", "account.manage"] },
  { role: "company_verifier", label: "Company Verifier", perms: ["certificate.verify", "certificate.view", "privacy.use", "account.manage"] },
  { role: "student", label: "Student", perms: ["certificate.view_own", "certificate.download", "certificate.verify", "account.manage"] },
  { role: "security_administrator", label: "Security Administrator", perms: ["certificate.view", "certificate.verify", "privacy.use", "user.view", "user.create", "user.update", "user.deactivate", "role.assign", "security.view", "security.configure", "audit.view", "incident.view", "incident.respond", "account.manage"] },
];

const ALL_PERMS = Array.from(new Set(ROLE_MATRIX.flatMap((r) => r.perms))).sort();

export function Roles() {
  return (
    <>
      <PageHeader title="Roles &amp;" accent="Permissions" subtitle="Role-to-permission mapping enforced on the backend (least privilege, deny by default)." />
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Permission</th>{ROLE_MATRIX.map((r) => <th key={r.role} style={{ textAlign: "center" }}>{r.label}</th>)}</tr></thead>
            <tbody>
              {ALL_PERMS.map((p) => (
                <tr key={p}>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{p}</td>
                  {ROLE_MATRIX.map((r) => (
                    <td key={r.role} style={{ textAlign: "center" }}>
                      {r.perms.includes(p) ? <span style={{ color: "var(--ok)" }}>✓</span> : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
