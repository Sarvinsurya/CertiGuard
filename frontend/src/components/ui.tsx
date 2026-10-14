import { useRef, useState, useContext, useCallback, createContext, type DragEvent, type ReactNode } from "react";

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active: { cls: "ok", label: "Active" },
    revoked: { cls: "danger", label: "Revoked" },
    VERIFIED: { cls: "ok", label: "Verified" },
    DOCUMENT_MISMATCH: { cls: "danger", label: "Document Mismatch" },
    INVALID_SIGNATURE: { cls: "danger", label: "Invalid Signature" },
    REVOKED: { cls: "danger", label: "Revoked" },
    NOT_REGISTERED: { cls: "warn", label: "Not Registered" },
    INCONCLUSIVE: { cls: "warn", label: "Inconclusive" },
    MATCH: { cls: "ok", label: "Match" },
    MISMATCH: { cls: "danger", label: "Mismatch" },
    VALID: { cls: "ok", label: "Valid" },
    INVALID: { cls: "danger", label: "Invalid" },
    FOUND: { cls: "ok", label: "Found" },
    NOT_FOUND: { cls: "danger", label: "Not Found" },
    ACTIVE: { cls: "ok", label: "Active" },
    UNKNOWN: { cls: "muted", label: "Unknown" },
    NOT_CHECKED: { cls: "muted", label: "Not Checked" },
  };
  const m = map[status] ?? { cls: "muted", label: status };
  return <span className={`chip ${m.cls}`}>{m.label}</span>;
}

interface FileDropProps {
  file: File | null;
  onFile: (f: File | null) => void;
  accept?: string;
}

export function FileDrop({ file, onFile, accept = "application/pdf,.pdf" }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <div
      className={`filedrop ${drag ? "drag" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <div className="fd-icon">📄</div>
      <div>
        {file ? "Click to replace the selected PDF" : "Drag & drop a PDF here, or click to browse"}
      </div>
      {file && (
        <div className="fd-file">
          {file.name} · {(file.size / 1024).toFixed(1)} KB
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}


/* ---- Severity + risk ---- */
export function SeverityBadge({ severity }: { severity: string }) {
  const s = (severity ?? "info").toLowerCase();
  return <span className={`sev ${s}`}>{s}</span>;
}

export function RiskIndicator({ score, level }: { score: number; level: string }) {
  return (
    <div style={{ minWidth: 160 }}>
      <div className="flex-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-2)", textTransform: "capitalize" }}>{level}</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{score}/100</span>
      </div>
      <div className={`risk-meter ${level}`}><span style={{ width: `${Math.max(2, Math.min(100, score))}%` }} /></div>
    </div>
  );
}

/* ---- Page header ---- */
export function PageHeader({ title, accent, subtitle, actions }: { title: string; accent?: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="flex-between">
        <div>
          <h1 className="page-title">{title} {accent && <span className="accent">{accent}</span>}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="row-actions" style={{ flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </div>
  );
}

/* ---- Stat card ---- */
export function StatCard({ label, value, variant = "g1" }: { label: string; value: string | number; variant?: "g1" | "g2" | "g3" | "g4" }) {
  return (
    <div className={`kpi ${variant}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

/* ---- States ---- */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="loading"><span className="spinner" style={{ marginRight: 8, verticalAlign: "middle" }} />{label}</div>;
}
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return <div className="empty"><div style={{ fontSize: 15, color: "var(--text-1)", marginBottom: 6 }}>{title}</div>{hint && <div style={{ fontSize: 13 }}>{hint}</div>}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div className="alert error">{message}</div>;
}

/* ---- Mini bar chart ---- */
export function MiniBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div key={i} className="bar" style={{ height: `${(d.value / max) * 100}%` }}>
          <span>{d.value}</span>
          <small>{d.label}</small>
        </div>
      ))}
    </div>
  );
}

/* ---- Confirmation modal ---- */
export function ConfirmModal({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onCancel }: {
  open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="card-title">{title}</h3>
        <div className="card-desc" style={{ marginBottom: 18 }}>{body}</div>
        <div className="row-actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Toast system ---- */
type Toast = { id: number; type: "success" | "error" | "info"; message: string };
const ToastContext = createContext<{ push: (type: Toast["type"], message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { push: () => {} };
}
