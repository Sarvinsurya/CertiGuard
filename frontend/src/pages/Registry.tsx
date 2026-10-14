import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  fetchCertificates,
  revokeCertificate,
  apiErrorMessage,
  type Certificate,
} from "../api/client";
import { StatusChip } from "../components/ui";

export function Registry() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCertificates({
        search: search || undefined,
        status: status || undefined,
      });
      setCerts(data.certificates);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function onRevoke(id: string) {
    const reason = window.prompt(
      `Revoke certificate "${id}" (prototype issuer action).\nEnter a revocation reason:`
    );
    if (!reason) return;
    try {
      await revokeCertificate(id, reason);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Certificate <span className="accent">Registry</span></h1>
        <p className="page-sub">
          Real records from the SQLite database. Search by certificate ID or student name,
          filter by status, and revoke active certificates (prototype issuer operation).
        </p>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search by certificate ID or student name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading…</div>
        ) : certs.length === 0 ? (
          <div className="empty">No certificates match your filters.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Certificate ID</th>
                  <th>Student</th>
                  <th>Qualification</th>
                  <th>Institution</th>
                  <th>Issue Date</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.certificateId}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{c.certificateId}</td>
                    <td>{c.studentName}</td>
                    <td>{c.qualification}</td>
                    <td>{c.institutionName}</td>
                    <td>{c.issueDate}</td>
                    <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td><StatusChip status={c.status} /></td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn btn-ghost btn-sm" to={`/certificates/${encodeURIComponent(c.certificateId)}`}>
                          Details
                        </Link>
                        {c.status === "active" && (
                          <button className="btn btn-danger btn-sm" onClick={() => onRevoke(c.certificateId)}>
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
