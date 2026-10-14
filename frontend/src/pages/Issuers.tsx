import { useEffect, useState } from "react";
import { fetchIssuers, apiErrorMessage, type Issuer } from "../api/client";
import { PageHeader, LoadingState, EmptyState } from "../components/ui";

export function Issuers() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchIssuers().then((d) => setIssuers(d.issuers)).catch((e) => setError(apiErrorMessage(e))).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <PageHeader title="Trusted" accent="Issuers" subtitle="Institutions whose public keys anchor certificate signature verification. Private keys never leave the backend." />
      <div className="card">
        {issuers.length === 0 ? <EmptyState title="No issuers registered" /> : issuers.map((i) => (
          <div key={i.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <div className="flex-between"><h3 className="card-title" style={{ margin: 0 }}>{i.issuerName}</h3><span className="chip ok">{i.status}</span></div>
            <div className="cr-desc">Code: {i.issuerCode} · Algorithm: {i.keyAlgorithm}</div>
            <div className="cr-desc" style={{ margin: "8px 0 4px" }}>Public key (trust anchor)</div>
            <div className="mono" style={{ whiteSpace: "pre-wrap" }}>{i.publicKey}</div>
          </div>
        ))}
      </div>
    </>
  );
}
