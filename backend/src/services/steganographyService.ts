import sharp from "sharp";
import { PNG } from "pngjs";

/**
 * Image LSB steganography (PNG carrier).
 *
 * Embeds a UTF-8 message in the least-significant bit of the R, G, B channels
 * (alpha is left untouched) of a PNG. A 32-bit big-endian length header
 * precedes the message so extraction knows how many bytes to read.
 *
 * Encoding format (bitstream over R,G,B LSBs, row-major):
 *   [ 32-bit length N ][ N bytes of UTF-8 message ]
 *
 * LIMITATIONS / honest claims:
 *   - Steganography is NOT encryption. Anyone who knows the method can extract
 *     the message. For confidentiality, encrypt (AES-256-GCM) BEFORE embedding.
 *   - Requires a LOSSLESS carrier (PNG). JPEG/lossy re-compression destroys the
 *     payload — not supported as a carrier.
 *   - No undetectability guarantee; statistical steganalysis can reveal LSB use.
 */

const HEADER_BITS = 32; // message length in bytes, big-endian
const MAX_IMAGE_PIXELS = 4_000_000; // ~4 MP cap

interface Raw {
  data: Buffer; // RGBA
  width: number;
  height: number;
}

async function toRgbaPng(input: Buffer): Promise<Raw> {
  const img = sharp(input);
  const meta = await img.metadata();
  if (meta.format !== "png") {
    throw new Error("Carrier must be a PNG image (lossless). JPEG is not supported.");
  }
  if (!meta.width || !meta.height) throw new Error("Could not read image dimensions.");
  if (meta.width * meta.height > MAX_IMAGE_PIXELS) {
    throw new Error("Image too large; please use a smaller PNG.");
  }
  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Usable payload capacity in bytes for a given image (R,G,B LSBs). */
export function capacityBytes(width: number, height: number): number {
  const totalLsb = width * height * 3; // 3 usable channels per pixel
  return Math.max(0, Math.floor((totalLsb - HEADER_BITS) / 8));
}

function* rgbIndices(raw: Raw): Generator<number> {
  // Yields buffer indices for R,G,B channels (skips A at every 4th byte).
  for (let i = 0; i < raw.data.length; i += 4) {
    yield i; // R
    yield i + 1; // G
    yield i + 2; // B
  }
}

export interface EmbedResult {
  pngBase64: string;
  capacityBytes: number;
  messageBytes: number;
  width: number;
  height: number;
}

export async function embedMessage(carrier: Buffer, message: string): Promise<EmbedResult> {
  if (typeof message !== "string" || message.length === 0) {
    throw new Error("A non-empty message is required.");
  }
  const raw = await toRgbaPng(carrier);
  const msgBytes = Buffer.from(message, "utf8");
  const cap = capacityBytes(raw.width, raw.height);
  if (msgBytes.length > cap) {
    throw new Error(
      `Message is too large for this carrier. Capacity ${cap} bytes, message ${msgBytes.length} bytes.`
    );
  }

  // Build the bitstream: 32-bit length + message bytes.
  const header = Buffer.alloc(4);
  header.writeUInt32BE(msgBytes.length, 0);
  const payload = Buffer.concat([header, msgBytes]);

  const bits: number[] = [];
  for (const byte of payload) {
    for (let b = 7; b >= 0; b--) bits.push((byte >> b) & 1);
  }

  const it = rgbIndices(raw);
  for (const bit of bits) {
    const idx = it.next().value as number;
    raw.data[idx] = (raw.data[idx] & 0xfe) | bit; // set LSB
  }

  const png = new PNG({ width: raw.width, height: raw.height });
  raw.data.copy(png.data);
  const out = PNG.sync.write(png);

  return {
    pngBase64: out.toString("base64"),
    capacityBytes: cap,
    messageBytes: msgBytes.length,
    width: raw.width,
    height: raw.height,
  };
}

export interface ExtractResult {
  message: string;
  messageBytes: number;
}

export async function extractMessage(stego: Buffer): Promise<ExtractResult> {
  const raw = await toRgbaPng(stego);
  const it = rgbIndices(raw);

  // Read 32-bit length header.
  let length = 0;
  for (let i = 0; i < HEADER_BITS; i++) {
    const idx = it.next().value as number;
    length = (length << 1) | (raw.data[idx] & 1);
  }
  length = length >>> 0;

  const cap = capacityBytes(raw.width, raw.height);
  if (length < 0 || length > cap) {
    throw new Error(
      "No valid hidden message found (length header out of range). The carrier may be unmodified or corrupted."
    );
  }

  const out = Buffer.alloc(length);
  for (let byteIdx = 0; byteIdx < length; byteIdx++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      const idx = it.next().value as number;
      byte = (byte << 1) | (raw.data[idx] & 1);
    }
    out[byteIdx] = byte;
  }

  return { message: out.toString("utf8"), messageBytes: length };
}

/** Generate a synthetic PNG carrier (gradient) for the lab default. */
export async function makeSampleCarrier(width = 160, height = 120): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b1b2f"/><stop offset="100%" stop-color="#ff6a3d"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
