import type { ReactNode } from "react";

interface LabIntroProps {
  title: string;
  accent: string;
  what: ReactNode;
  why: ReactNode;
  how: ReactNode;
  limitations: ReactNode;
}

/** Consistent lab header: title + what/why/how/limitations explainer. */
export function LabIntro({ title, accent, what, why, how, limitations }: LabIntroProps) {
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">
          {title} <span className="accent">{accent}</span>
        </h1>
      </div>
      <div className="grid cols-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3 className="card-title">What &amp; why</h3>
          <p className="card-desc" style={{ marginBottom: 10 }}>
            <b>What:</b> {what}
          </p>
          <p className="card-desc" style={{ margin: 0 }}>
            <b>Why it matters:</b> {why}
          </p>
        </div>
        <div className="card">
          <h3 className="card-title">How it works &amp; limitations</h3>
          <p className="card-desc" style={{ marginBottom: 10 }}>
            <b>How:</b> {how}
          </p>
          <p className="card-desc" style={{ margin: 0 }}>
            <b>Limitations:</b> {limitations}
          </p>
        </div>
      </div>
    </>
  );
}
