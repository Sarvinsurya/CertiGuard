import { useState, type FormEvent } from "react";
import {
  verifyCertificate,
  apiErrorMessage,
  type VerificationResult,
} from "../api/client";
import { FileDrop, StatusChip } from "../components/ui";

const bannerFor: Record<string, { cls: string; icon: string; title: string }> = {
  VERIFIED: { cls: "ok", icon: "✓", title: "Verified" },
  DOCUMENT_MISMATCH: { cls: "danger", icon: "✕", title: "Document Mismatch" },
  INVALID_SIGNATURE: { cls: "danger", icon: "✕", title: "Invalid Signature" },
  REVOKED: { cls: "danger", icon: "⦻", title: "Revoked" },
  NOT_REGISTERED: { cls: "warn", icon: "?", title: "Not Registered" },
  INCONCLUSIVE: { cls: "warn", icon: "!", title: "Inconclusive" },
};

export function Verify() {
  const [certificateId, setCertificateId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!certificateId.trim()) return setError("Enter a certificate ID.");
    if (!file) return setError("Attach the candidate PDF.");

    const fd = new FormData();
    fd.append("certificateId", certificateId.trim());
    fd.append("file", file);

    setSubmitting(true);
    try {
      setResult(await verifyCertificate(fd));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const banner = result ? bannerFor[result.overall] : null;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Verify <span className="accent">Certificate</span></h1>
        <p className="page-sub">
          Enter the certificate ID and upload the candidate PDF. The backend independently
          checks the record, document integrity (SHA-256), the issuer signature (Ed25519),
          and revocation status. The result below comes entirely from the server.
        </p>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <form className="card" onSubmit={onSubmit}>
          <h3 className="card-title">Verification input</h3>
          <p className="card-desc">Both a certificate ID and a PDF are required.</p>
          <div className="field">
            <label>Certificate ID</label>
            <input className="input" value={certificateId} onChange={(e) => setCertificateId(e.target.value)} placeholder="e.g. CGDU-2024-0001" />
          </div>
          <div className="field">
            <label>Candidate PDF</label>
            <FileDrop file={file} onFile={setFile} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>

        <div className="card">
          <h3 className="card-title">Verification result</h3>
          {!result ? (
            <div className="empty">Submit a certificate to see the result.</div>
          ) : (
            <>
              {banner && (
                <div className={`result-banner ${banner.cls}`}>
                  <div className="rb-icon">{banner.icon}</div>
                  <div>
                    <div className="rb-title">{banner.title}</div>
                    <div className="rb-sub">{result.explanation}</div>
                  </div>
                </div>
              )}

              <div className="kv" style={{ marginBottom: 14 }}>
                <dt>Certificate ID</dt>
                <dd style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{result.certificateId}</dd>
                <dt>Registered issuer</dt>
                <dd>{result.issuer ? `${result.issuer.issuerName} (${result.issuer.issuerCode})` : "—"}</dd>
              </div>

              <div className="check-row">
                <div><div className="cr-label">Certificate record</div><div className="cr-desc">Is this ID registered?</div></div>
                <StatusChip status={result.checks.record} />
              </div>
              <div className="check-row">
                <div><div className="cr-label">Document integrity</div><div className="cr-desc">SHA-256 of uploaded PDF vs registered hash</div></div>
                <StatusChip status={result.checks.integrity} />
              </div>
              <div className="check-row">
                <div><div className="cr-label">Digital signature</div><div className="cr-desc">Ed25519 signature over canonical metadata</div></div>
                <StatusChip status={result.checks.signature} />
              </div>
              <div className="check-row">
                <div><div className="cr-label">Revocation status</div><div className="cr-desc">Is the certificate still active?</div></div>
                <StatusChip status={result.checks.revocation} />
              </div>

              {(result.details.submittedHash || result.details.registeredHash) && (
                <div style={{ marginTop: 16 }}>
                  <div className="cr-desc" style={{ marginBottom: 4 }}>Submitted hash</div>
                  <div className="mono">{result.details.submittedHash ?? "—"}</div>
                  {result.details.registeredHash && (
                    <>
                      <div className="cr-desc" style={{ margin: "10px 0 4px" }}>Registered hash</div>
                      <div className="mono">{result.details.registeredHash}</div>
                    </>
                  )}
                </div>
              )}

              {result.details.revocationReason && (
                <div className="alert error" style={{ marginTop: 14 }}>
                  Revoked {result.details.revokedAt ? `on ${new Date(result.details.revokedAt).toLocaleString()}` : ""}: {result.details.revocationReason}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
