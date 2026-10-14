import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchCertificate,
  revokeCertificate,
  apiErrorMessage,
  type Certificate,
  type Issuer,
} from "../api/client";
import { StatusChip } from "../components/ui";

export function CertificateDetails() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [cert, setCert] = useState<Certificate | null>(null);
  const [issuer, setIssuer] = useState<Issuer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!certificateId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCertificate(certificateId);
      setCert(data.certificate);
      setIssuer(data.issuer);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [certificateId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRevoke() {
    if (!cert) return;
    const reason = window.prompt(
      `Revoke "${cert.certificateId}" (prototype issuer action).\nEnter a revocation reason:`
    );
    if (!reason) return;
    try {
      await revokeCertificate(cert.certificateId, reason);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert error">{error}</div>;
  if (!cert) return <div className="empty">Certificate not found.</div>;

  return (
    <>
      <div className="page-head">
        <div className="flex-between">
          <h1 className="page-title">Certificate <span className="accent">Details</span></h1>
          <Link className="btn btn-ghost btn-sm" to="/registry">← Back to registry</Link>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h3 className="card-title" style={{ fontFamily: "var(--mono)", fontSize: 15 }}>{cert.certificateId}</h3>
          <div className="flex">
            <StatusChip status={cert.status} />
            {cert.status === "active" && (
              <button className="btn btn-danger btn-sm" onClick={onRevoke}>Revoke</button>
            )}
          </div>
        </div>

        <dl className="kv">
          <dt>Student name</dt><dd>{cert.studentName}</dd>
          <dt>Student identifier</dt><dd>{cert.studentIdentifier}</dd>
          <dt>Institution</dt><dd>{cert.institutionName}</dd>
          <dt>Qualification</dt><dd>{cert.qualification}</dd>
          <dt>Graduation year</dt><dd>{cert.graduationYear}</dd>
          <dt>Issue date</dt><dd>{cert.issueDate}</dd>
          <dt>Registered</dt><dd>{new Date(cert.createdAt).toLocaleString()}</dd>
          {cert.status === "revoked" && (
            <>
              <dt>Revoked at</dt><dd>{cert.revokedAt ? new Date(cert.revokedAt).toLocaleString() : "—"}</dd>
              <dt>Revocation reason</dt><dd>{cert.revocationReason}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="card">
        <h3 className="card-title">Cryptographic record</h3>
        <p className="card-desc">
          The document hash protects the PDF bytes; the signature protects the metadata. These
          are independent integrity mechanisms.
        </p>
        <div className="cr-desc" style={{ marginBottom: 4 }}>Document SHA-256</div>
        <div className="mono">{cert.documentHash}</div>
        <div className="cr-desc" style={{ margin: "12px 0 4px" }}>Signature ({cert.signatureAlgorithm}) · canonical v{cert.canonicalFormatVersion}</div>
        <div className="mono">{cert.signature}</div>
      </div>

      <div className="card">
        <h3 className="card-title">Issuer</h3>
        {issuer ? (
          <>
            <dl className="kv">
              <dt>Issuer</dt><dd>{issuer.issuerName}</dd>
              <dt>Issuer code</dt><dd>{issuer.issuerCode}</dd>
              <dt>Key algorithm</dt><dd>{issuer.keyAlgorithm}</dd>
              <dt>Status</dt><dd>{issuer.status}</dd>
            </dl>
            <div className="cr-desc" style={{ margin: "12px 0 4px" }}>Public key (trust anchor)</div>
            <div className="mono" style={{ whiteSpace: "pre-wrap" }}>{issuer.publicKey}</div>
          </>
        ) : (
          <div className="empty">Issuer not found.</div>
        )}
      </div>
    </>
  );
}
