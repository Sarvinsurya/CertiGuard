import { useState } from "react";
import { hashLab, apiErrorMessage, type HashLabResult } from "../api/client";
import { FileDrop } from "../components/ui";

function Slot({
  title,
  result,
  file,
  onFile,
  onHash,
  busy,
}: {
  title: string;
  result: HashLabResult | null;
  file: File | null;
  onFile: (f: File | null) => void;
  onHash: () => void;
  busy: boolean;
}) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <FileDrop file={file} onFile={onFile} />
      <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={onHash} disabled={!file || busy}>
        {busy ? "Hashing…" : "Compute SHA-256"}
      </button>
      {result && (
        <div style={{ marginTop: 14 }}>
          <div className="cr-desc">{result.fileName} · {result.fileSizeBytes} bytes</div>
          <div className="mono" style={{ marginTop: 6 }}>{result.hash}</div>
        </div>
      )}
    </div>
  );
}

export function HashLab() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [resA, setResA] = useState<HashLabResult | null>(null);
  const [resB, setResB] = useState<HashLabResult | null>(null);
  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);
  const [error, setError] = useState("");

  async function hash(file: File | null, setRes: (r: HashLabResult) => void, setBusy: (b: boolean) => void) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setRes(await hashLab(fd));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const compared = resA && resB;
  const match = compared && resA!.hash === resB!.hash;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">SHA-256 <span className="accent">Hashing Lab</span></h1>
        <p className="page-sub">
          Every digest is computed by the backend from the exact uploaded file bytes.
          Upload an original PDF on the left and a modified copy on the right to see that
          even a tiny byte change produces a completely different digest.
        </p>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="alert info">
        A hash proves <b>integrity</b> (the bytes are unchanged). It does <b>not</b> prove who
        authored the document — that is the role of the issuer's digital signature and trust model.
      </div>

      <div className="grid cols-2">
        <Slot title="File A (e.g. original)" result={resA} file={fileA} onFile={(f) => { setFileA(f); setResA(null as unknown as HashLabResult); }} onHash={() => hash(fileA, setResA, setBusyA)} busy={busyA} />
        <Slot title="File B (e.g. modified)" result={resB} file={fileB} onFile={(f) => { setFileB(f); setResB(null as unknown as HashLabResult); }} onHash={() => hash(fileB, setResB, setBusyB)} busy={busyB} />
      </div>

      {compared && (
        <div className={`result-banner ${match ? "warn" : "ok"}`} style={{ marginTop: 18 }}>
          <div className="rb-icon">{match ? "=" : "≠"}</div>
          <div>
            <div className="rb-title">{match ? "Digests are identical" : "Digests differ"}</div>
            <div className="rb-sub">
              {match
                ? "Both files are byte-for-byte identical, so SHA-256 produced the same digest."
                : "The files differ, so SHA-256 produced different digests. A single changed byte flips roughly half the output bits with overwhelming probability."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
