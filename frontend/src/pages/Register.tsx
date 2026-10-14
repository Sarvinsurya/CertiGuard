import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { registerCertificate, apiErrorMessage, type Certificate } from "../api/client";
import { FileDrop } from "../components/ui";

const emptyForm = {
  certificateId: "",
  studentName: "",
  studentIdentifier: "",
  institutionName: "CertiGuard Demonstration University",
  qualification: "",
  graduationYear: String(new Date().getFullYear()),
  issueDate: "",
};

export function Register() {
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Certificate | null>(null);
  const navigate = useNavigate();

  function update(key: keyof typeof emptyForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!file) {
      setError("Please attach the certificate PDF.");
      return;
    }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append("file", file);

    setSubmitting(true);
    try {
      const data = await registerCertificate(fd);
      setResult(data.certificate);
      setForm(emptyForm);
      setFile(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Register <span className="accent">Certificate</span></h1>
        <p className="page-sub">
          The backend computes the PDF's SHA-256 hash, builds a deterministic canonical
          metadata record, and signs it with the issuer's Ed25519 private key. The private
          key never leaves the server.
        </p>
      </div>

      {error && <div className="alert error">{error}</div>}
      {result && (
        <div className="alert success">
          Registered <b>{result.certificateId}</b>. SHA-256:{" "}
          <span className="mono" style={{ display: "inline" }}>{result.documentHash.slice(0, 24)}…</span>{" "}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 10 }}
            onClick={() => navigate(`/certificates/${encodeURIComponent(result.certificateId)}`)}
          >
            Open details →
          </button>
        </div>
      )}

      <form className="card" onSubmit={onSubmit}>
        <div className="grid cols-2">
          <div className="field">
            <label>Certificate ID</label>
            <input className="input" value={form.certificateId} onChange={(e) => update("certificateId", e.target.value)} placeholder="e.g. CGDU-2024-0001" required />
            <div className="hint">Letters, digits, and . _ / - only. Must be unique.</div>
          </div>
          <div className="field">
            <label>Student Name</label>
            <input className="input" value={form.studentName} onChange={(e) => update("studentName", e.target.value)} required />
          </div>
          <div className="field">
            <label>Student Identifier</label>
            <input className="input" value={form.studentIdentifier} onChange={(e) => update("studentIdentifier", e.target.value)} placeholder="e.g. STU-2024-0001" required />
          </div>
          <div className="field">
            <label>Institution Name</label>
            <input className="input" value={form.institutionName} onChange={(e) => update("institutionName", e.target.value)} required />
          </div>
          <div className="field">
            <label>Qualification / Course</label>
            <input className="input" value={form.qualification} onChange={(e) => update("qualification", e.target.value)} placeholder="e.g. B.Tech Computer Science" required />
          </div>
          <div className="field">
            <label>Graduation Year</label>
            <input className="input" type="number" value={form.graduationYear} onChange={(e) => update("graduationYear", e.target.value)} required />
          </div>
          <div className="field">
            <label>Issue Date</label>
            <input className="input" type="date" value={form.issueDate} onChange={(e) => update("issueDate", e.target.value)} required />
          </div>
        </div>

        <div className="field">
          <label>Certificate PDF</label>
          <FileDrop file={file} onFile={setFile} />
          <div className="hint">PDF only, max 10 MB. Validated by MIME type and %PDF- magic bytes.</div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Registering…" : "Register certificate"}
        </button>
      </form>
    </>
  );
}
