import { useState } from "react";
import {
  privacyVcSplit,
  privacyVcReconstruct,
  apiErrorMessage,
  type VcSplitResult,
} from "../../api/client";
import { LabIntro } from "../../components/LabIntro";
import { FileDrop } from "../../components/ui";

function b64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

export function VisualCryptographyLab() {
  const [text, setText] = useState("CG");
  const [image, setImage] = useState<File | null>(null);
  const [split, setSplit] = useState<VcSplitResult | null>(null);
  const [reconstructed, setReconstructed] = useState<string | null>(null);
  const [useOnlyShare1, setUseOnlyShare1] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function doSplit() {
    setError(""); setBusy(true); setReconstructed(null);
    try { setSplit(await privacyVcSplit(text, image ?? undefined)); }
    catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  async function doReconstruct() {
    if (!split) return;
    setError(""); setBusy(true);
    try {
      const s1 = b64ToBlob(split.share1Base64);
      // "Missing share" demo: reconstruct share1 with itself -> secret not revealed.
      const s2 = useOnlyShare1 ? b64ToBlob(split.share1Base64) : b64ToBlob(split.share2Base64);
      const r = await privacyVcReconstruct(s1, s2);
      setReconstructed(r.reconstructedBase64);
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  const img = (b64: string) => `data:image/png;base64,${b64}`;

  return (
    <>
      <LabIntro
        title="Visual Cryptography" accent="Lab"
        what="Splits a binary secret image into two shares; stacking both reveals the secret, one alone reveals nothing."
        why="Demonstrates information-theoretic secret sharing — no key, no computation needed to 'decrypt', just overlay."
        how="2-out-of-2 Naor–Shamir scheme on the backend (sharp + pngjs). Each secret pixel → a 2×2 block; white uses identical patterns, black uses complementary patterns. Stacking = OR of black subpixels."
        limitations="Works on binarized images; 2× pixel expansion; white becomes grey (reduced contrast). Photographic/colour images are thresholded first."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h3 className="card-title">1 · Create a secret &amp; split</h3>
        <div className="grid cols-2">
          <div className="field">
            <label>Sample secret text (used if no image)</label>
            <input className="input" maxLength={4} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="hint">1–4 characters rendered to a black/white image.</div>
          </div>
          <div className="field">
            <label>Or upload a small image (≤256×256)</label>
            <FileDrop file={image} onFile={setImage} accept="image/*" />
          </div>
        </div>
        <button className="btn btn-primary" onClick={doSplit} disabled={busy}>Generate shares</button>
      </div>

      {split && (
        <>
          <div className="grid cols-2">
            <div className="card">
              <h3 className="card-title">Share 1 (noise alone)</h3>
              <img src={img(split.share1Base64)} alt="Share 1" style={{ width: "100%", imageRendering: "pixelated", background: "#fff", borderRadius: 8 }} />
            </div>
            <div className="card">
              <h3 className="card-title">Share 2 (noise alone)</h3>
              <img src={img(split.share2Base64)} alt="Share 2" style={{ width: "100%", imageRendering: "pixelated", background: "#fff", borderRadius: 8 }} />
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">2 · Reconstruct (stack shares)</h3>
            <label className="flex" style={{ gap: 8, marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={useOnlyShare1} onChange={(e) => setUseOnlyShare1(e.target.checked)} />
              <span style={{ color: "var(--text-1)", fontSize: 14 }}>Missing-share demo: stack Share 1 with itself (secret should NOT appear)</span>
            </label>
            <button className="btn btn-primary" onClick={doReconstruct} disabled={busy}>Reconstruct</button>
            {reconstructed && (
              <div style={{ marginTop: 16 }}>
                <div className="cr-desc" style={{ marginBottom: 6 }}>
                  {useOnlyShare1 ? "Share1 + Share1 (secret concealed)" : "Share1 + Share2 (secret revealed)"}
                </div>
                <img src={img(reconstructed)} alt="Reconstructed" style={{ width: "100%", maxWidth: 320, imageRendering: "pixelated", background: "#fff", borderRadius: 8 }} />
              </div>
            )}
          </div>
          <div className="alert info">{split.note}</div>
        </>
      )}
    </>
  );
}
