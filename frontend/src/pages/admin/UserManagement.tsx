import { useEffect, useState, useCallback } from "react";
import {
  fetchUsers, createUserApi, deactivateUser, activateUser, assignUserRole, resetUserMfa,
  apiErrorMessage, type AdminUser,
} from "../../api/client";
import { PageHeader, LoadingState, EmptyState, StatusChip, ConfirmModal, useToast } from "../../components/ui";

const ROLES = [
  { value: "institution_issuer", label: "Institution Issuer" },
  { value: "company_verifier", label: "Company Verifier" },
  { value: "student", label: "Student" },
  { value: "security_administrator", label: "Security Administrator" },
];

export function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirm, setConfirm] = useState<{ user: AdminUser; action: "deactivate" } | null>(null);
  const [form, setForm] = useState({ email: "", displayName: "", role: "student", password: "", organizationName: "", studentIdentifier: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers((await fetchUsers({ search, role: roleFilter || undefined, status: statusFilter || undefined })).users); }
    catch (e) { toast.push("error", apiErrorMessage(e)); } finally { setLoading(false); }
  }, [search, roleFilter, statusFilter, toast]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function submitCreate() {
    try {
      await createUserApi({ ...form, mustChangePassword: true });
      toast.push("success", "User created.");
      setShowCreate(false);
      setForm({ email: "", displayName: "", role: "student", password: "", organizationName: "", studentIdentifier: "" });
      load();
    } catch (e) { toast.push("error", apiErrorMessage(e)); }
  }

  async function doDeactivate(u: AdminUser) {
    try { await deactivateUser(u.id); toast.push("success", "User deactivated."); load(); }
    catch (e) { toast.push("error", apiErrorMessage(e)); }
    setConfirm(null);
  }
  async function doActivate(u: AdminUser) { try { await activateUser(u.id); load(); } catch (e) { toast.push("error", apiErrorMessage(e)); } }
  async function doRole(u: AdminUser, role: string) { try { await assignUserRole(u.id, role); toast.push("success", "Role updated; sessions revoked."); load(); } catch (e) { toast.push("error", apiErrorMessage(e)); } }
  async function doResetMfa(u: AdminUser) { try { await resetUserMfa(u.id); toast.push("success", "MFA reset."); load(); } catch (e) { toast.push("error", apiErrorMessage(e)); } }

  return (
    <>
      <PageHeader title="User" accent="Management" subtitle="Manage accounts, roles, and account status."
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New user</button>} />

      <div className="toolbar">
        <input className="input" placeholder="Search email or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="card">
        {loading ? <LoadingState /> : users.length === 0 ? <EmptyState title="No users match your filters" /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Org</th><th>MFA</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{u.email}</td>
                <td>{u.displayName}</td>
                <td>
                  <select className="select" style={{ padding: "4px 8px", fontSize: 12, width: "auto" }} value={u.role} onChange={(e) => doRole(u, e.target.value)}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td>{u.organizationName ?? "—"}</td>
                <td>{u.mfaEnabled ? <span className="chip ok">On</span> : <span className="chip muted">Off</span>}</td>
                <td><StatusChip status={u.status === "active" ? "active" : "revoked"} /></td>
                <td style={{ color: "var(--text-3)", fontSize: 12 }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}</td>
                <td><div className="row-actions">
                  {u.status === "active"
                    ? <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ user: u, action: "deactivate" })}>Deactivate</button>
                    : <button className="btn btn-ghost btn-sm" onClick={() => doActivate(u)}>Activate</button>}
                  {u.mfaEnabled && <button className="btn btn-ghost btn-sm" onClick={() => doResetMfa(u)}>Reset MFA</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title">Create user</h3>
            <div className="field"><label>Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Display name</label><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
            <div className="field"><label>Role</label>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div className="field"><label>Organization (optional)</label><input className="input" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} /></div>
            {form.role === "student" && <div className="field"><label>Student identifier</label><input className="input" value={form.studentIdentifier} onChange={(e) => setForm({ ...form, studentIdentifier: e.target.value })} /></div>}
            <div className="field"><label>Temporary password</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <div className="hint">User must change it on first login. Min 10 chars with upper/lower/digit.</div></div>
            <div className="row-actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submitCreate}>Create</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirm} title="Deactivate user" danger confirmLabel="Deactivate"
        body={<>Deactivating <b>{confirm?.user.email}</b> revokes their sessions and blocks sign-in. This is reversible.</>}
        onCancel={() => setConfirm(null)} onConfirm={() => confirm && doDeactivate(confirm.user)} />
    </>
  );
}
