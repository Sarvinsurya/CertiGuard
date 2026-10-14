import sharp from "sharp";
import { PNG } from "pngjs";
import crypto from "node:crypto";

/**
 * Visual Cryptography — 2-out-of-2 Naor–Shamir scheme.
 *
 * The secret is a binary (black/white) image. Each secret pixel becomes a 2x2
 * block in each of two shares (pixel expansion = 2x in each dimension):
 *   - For a WHITE pixel: both shares get the SAME random pattern -> stacked = that
 *     pattern (2 black subpixels of 4) => appears "light grey".
 *   - For a BLACK pixel: shares get COMPLEMENTARY patterns -> stacked = all 4
 *     black => appears "black".
 * Stacking = OR of black subpixels. A single share is random noise and reveals
 * nothing about the secret (information-theoretic security of the scheme).
 *
 * LIMITATIONS: works on binarized images; there is 2x pixel expansion and
 * reduced contrast (white becomes grey). Photographic/colour images are
 * thresholded to black/white first and will lose detail.
 */

const MAX_DIM = 256; // max secret dimension (keeps share size reasonable)

// The six 2x2 patterns with exactly two black subpixels. We use a base pattern
// and its complement per pixel.
type Pattern = [number, number, number, number]; // 1 = black subpixel

const BASE_PATTERNS: Pattern[] = [
  [1, 1, 0, 0],
  [0, 0, 1, 1],
  [1, 0, 1, 0],
  [0, 1, 0, 1],
  [1, 0, 0, 1],
  [0, 1, 1, 0],
];

function complement(p: Pattern): Pattern {
  return [p[0] ^ 1, p[1] ^ 1, p[2] ^ 1, p[3] ^ 1] as Pattern;
}

export interface BinarizeResult {
  width: number;
  height: number;
  /** 1 = black (secret), 0 = white, row-major length width*height */
  bits: Uint8Array;
}

/** Convert an input image buffer to a binary bitmap (threshold at mid-grey). */
export async function binarize(input: Buffer, threshold = 128): Promise<BinarizeResult> {
  const img = sharp(input).grayscale();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read image dimensions.");
  if (meta.width > MAX_DIM || meta.height > MAX_DIM) {
    throw new Error(`Image too large; max ${MAX_DIM}x${MAX_DIM} pixels.`);
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array(info.width * info.height);
  const channels = info.channels;
  for (let i = 0; i < info.width * info.height; i++) {
    const lum = data[i * channels];
    bits[i] = lum < threshold ? 1 : 0; // dark => black (secret ink)
  }
  return { width: info.width, height: info.height, bits };
}

function makeSharePng(width: number, height: number): PNG {
  return new PNG({ width: width * 2, height: height * 2 });
}

function setBlock(png: PNG, bx: number, by: number, pattern: Pattern): void {
  // pattern indices: [TL, TR, BL, BR]
  const coords: Array<[number, number, number]> = [
    [bx * 2, by * 2, pattern[0]],
    [bx * 2 + 1, by * 2, pattern[1]],
    [bx * 2, by * 2 + 1, pattern[2]],
    [bx * 2 + 1, by * 2 + 1, pattern[3]],
  ];
  for (const [x, y, black] of coords) {
    const idx = (png.width * y + x) << 2;
    const v = black ? 0 : 255;
    png.data[idx] = v;
    png.data[idx + 1] = v;
    png.data[idx + 2] = v;
    png.data[idx + 3] = 255;
  }
}

export interface SplitResult {
  width: number;
  height: number;
  share1Png: Buffer;
  share2Png: Buffer;
}

/** Split a binary secret image into two shares (PNG buffers). */
export function splitShares(binary: BinarizeResult): SplitResult {
  const { width, height, bits } = binary;
  const s1 = makeSharePng(width, height);
  const s2 = makeSharePng(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const secretBlack = bits[y * width + x] === 1;
      const base = BASE_PATTERNS[crypto.randomInt(BASE_PATTERNS.length)];
      const p1 = base;
      // white -> identical patterns; black -> complementary patterns
      const p2 = secretBlack ? complement(base) : base;
      setBlock(s1, x, y, p1);
      setBlock(s2, x, y, p2);
    }
  }

  return {
    width,
    height,
    share1Png: PNG.sync.write(s1),
    share2Png: PNG.sync.write(s2),
  };
}

/**
 * Reconstruct by stacking two shares (OR of black subpixels).
 * Shares must have identical dimensions. Returns a PNG buffer.
 */
export function reconstruct(share1Png: Buffer, share2Png: Buffer): Buffer {
  const a = PNG.sync.read(share1Png);
  const b = PNG.sync.read(share2Png);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("Shares have mismatched dimensions; cannot reconstruct.");
  }
  const out = new PNG({ width: a.width, height: a.height });
  for (let i = 0; i < a.width * a.height; i++) {
    const idx = i << 2;
    // black if EITHER share is black at this subpixel (stacking = OR)
    const aBlack = a.data[idx] < 128;
    const bBlack = b.data[idx] < 128;
    const v = aBlack || bBlack ? 0 : 255;
    out.data[idx] = v;
    out.data[idx + 1] = v;
    out.data[idx + 2] = v;
    out.data[idx + 3] = 255;
  }
  return PNG.sync.write(out);
}

/** Generate a synthetic secret image (text/initials) as a PNG for the lab. */
export async function makeSampleSecret(text = "CG"): Promise<Buffer> {
  const size = 64;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="white"/>
    <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="34"
      font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="black">${text}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
