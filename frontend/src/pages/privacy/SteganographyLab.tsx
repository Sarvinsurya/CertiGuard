import { useEffect, useState } from "react";
import {
  privacyStegoSample,
  privacyStegoEmbed,
  privacyStegoExtract,
  apiErrorMessage,
  type StegoEmbedResult,
} from "../../api/client";
import { LabIntro } from "../../components/LabIntro";
import { FileDrop } from "../../components/ui";

function b64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

export function SteganographyLab() {
  const [message, setMessage] = useState("Meet at the archive room, 3pm.");
  const [carrierB64, setCarrierB64] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [uploadCarrier, setUploadCarrier] = useState<File | null>(null);
  const [embed, setEmbed] = useState<StegoEmbedResult | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    privacyStegoSample().then((r) => { setCarrierB64(r.carrierBase64); setCapacity(r.capacityBytes); })
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  async function doEmbed() {
    setError(""); setBusy(true); setExtracted(null);
    try {
      const carrier = uploadCarrier ?? (carrierB64 ? new File([b64ToBlob(carrierB64)], "carrier.png", { type: "image/png" }) : null);
      if (!carrier) throw new Error("No carrier image available.");
      setEmbed(await privacyStegoEmbed(message, carrier));
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  async function doExtract(fromStego: boolean) {
    setError(""); setBusy(true);
    try {
      let blob: Blob | null = null;
      if (fromStego && embed) blob = b64ToBlob(embed.pngBase64);
      else if (!fromStego && carrierB64) blob = b64ToBlob(carrierB64); // original carrier → should fail
      if (!blob) throw new Error("No image available to extract from.");
      const r = await privacyStegoExtract(blob);
      setExtracted(r.message);
    } catch (e) { setError(apiErrorMessage(e)); setExtracted(null); }
    finally { setBusy(false); }
  }

  const img = (b64: string) => `data:image/png;base64,${b64}`;

  return (
    <>
      <LabIntro
        title="Steganography" accent="Lab (PNG LSB)"
        what="Hides a text message in the least-significant bits of a PNG's pixels, then extracts it back."
        why="Demonstrates covert data embedding and its fragility — a different protection goal from encryption."
        how="Backend LSB over R,G,B channels with a 32-bit length header (sharp + pngjs). PNG only (lossless)."
        limitations="NOT encryption — anyone who knows the method can extract it; encrypt before embedding for secrecy. JPEG/lossy edits destroy the payload. No undetectability guarantee."
      />

      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h3 className="card-title">1 · Embed a message</h3>
        <div className="grid cols-2">
          <div className="field">
            <label>Message</label>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
            {capacity !== null && <div className="hint">Sample carrier capacity ≈ {capacity} bytes.</div>}
          </div>
          <div className="field">
            <label>Carrier PNG (optional — a sample gradient is used otherwise)</label>
            <FileDrop file={uploadCarrier} onFile={setUploadCarrier} accept="image/png" />
            {carrierB64 && !uploadCarrier && (
              <img src={img(carrierB64)} alt="Sample carrier" style={{ width: 160, marginTop: 10, borderRadius: 8 }} />
            )}
          </div>
        </div>
        <button className="btn btn-primary" onClick={doEmbed} disabled={busy || !message}>Embed</button>
      </div>

      {embed && (
        <div className="card">
          <h3 className="card-title">2 · Stego image &amp; extraction</h3>
          <div className="flex" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span className="chip ok">Embedded {embed.messageBytes} bytes</span>
            <span className="chip info">Capacity {embed.capacityBytes} bytes</span>
            <span className="chip muted">{embed.width}×{embed.height}</span>
          </div>
          <img src={img(embed.pngBase64)} alt="Stego" style={{ width: 200, borderRadius: 8, marginBottom: 14 }} />
          <div className="row-actions" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={() => doExtract(true)} disabled={busy}>Extract from stego image</button>
            <button className="btn btn-danger btn-sm" onClick={() => doExtract(false)} disabled={busy}>Try extract from ORIGINAL carrier (should fail)</button>
          </div>
          {extracted !== null && (
            <div className="result-banner ok" style={{ marginTop: 14 }}>
              <div className="rb-icon">✓</div>
              <div><div className="rb-title">Extracted message</div><div className="rb-sub" style={{ wordBreak: "break-word" }}>{extracted}</div></div>
            </div>
          )}
          <div className="alert info" style={{ marginTop: 14 }}>{embed.note}</div>
        </div>
      )}
    </>
  );
}
