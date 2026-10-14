import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import {
  binarize,
  splitShares,
  reconstruct,
  makeSampleSecret,
} from "../src/services/visualCryptoService.js";
import {
  embedMessage,
  extractMessage,
  capacityBytes,
  makeSampleCarrier,
} from "../src/services/steganographyService.js";

function blackRatio(png: Buffer): number {
  const img = PNG.sync.read(png);
  let black = 0;
  const total = img.width * img.height;
  for (let i = 0; i < total; i++) if (img.data[i << 2] < 128) black++;
  return black / total;
}

describe("Visual cryptography (2-of-2)", () => {
  it("generates two shares of doubled dimensions", async () => {
    const secret = await makeSampleSecret("CG");
    const binary = await binarize(secret);
    const { width, height, share1Png, share2Png } = splitShares(binary);
    const s1 = PNG.sync.read(share1Png);
    expect(s1.width).toBe(width * 2);
    expect(s1.height).toBe(height * 2);
    expect(share1Png.length).toBeGreaterThan(0);
    expect(share2Png.length).toBeGreaterThan(0);
  });

  it("reconstruction is darker than a single share (secret revealed by stacking)", async () => {
    const secret = await makeSampleSecret("CG");
    const binary = await binarize(secret);
    const { share1Png, share2Png } = splitShares(binary);
    const combined = reconstruct(share1Png, share2Png);
    // Each share ~50% black; stacked image has strictly more black where the
    // secret is (black pixels -> all 4 subpixels black).
    const shareBlack = blackRatio(share1Png);
    const combinedBlack = blackRatio(combined);
    expect(combinedBlack).toBeGreaterThan(shareBlack);
  });

  it("a single share is close to 50% black (no secret leaked by brightness)", async () => {
    const secret = await makeSampleSecret("CG");
    const binary = await binarize(secret);
    const { share1Png } = splitShares(binary);
    const ratio = blackRatio(share1Png);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it("rejects reconstruction of mismatched-dimension shares", async () => {
    const a = await makeSampleSecret("A");
    const b = await makeSampleSecret("BB");
    const sa = splitShares(await binarize(a));
    const sb = splitShares(await binarize(b));
    // different text -> potentially different sizes; force mismatch via different secrets of same size is unreliable,
    // so build an explicitly smaller png:
    const small = PNG.sync.write(new PNG({ width: 4, height: 4 }));
    expect(() => reconstruct(sa.share1Png, small)).toThrow();
    expect(sb.share1Png.length).toBeGreaterThan(0);
  });
});

describe("Steganography (PNG LSB)", () => {
  it("embeds and extracts a message round-trip", async () => {
    const carrier = await makeSampleCarrier(120, 80);
    const { pngBase64 } = await embedMessage(carrier, "hidden message!");
    const stego = Buffer.from(pngBase64, "base64");
    const { message } = await extractMessage(stego);
    expect(message).toBe("hidden message!");
  });

  it("preserves unicode text", async () => {
    const carrier = await makeSampleCarrier(120, 80);
    const msg = "secret ✓ café 密码";
    const { pngBase64 } = await embedMessage(carrier, msg);
    const { message } = await extractMessage(Buffer.from(pngBase64, "base64"));
    expect(message).toBe(msg);
  });

  it("enforces capacity", async () => {
    const carrier = await makeSampleCarrier(16, 16); // tiny
    const cap = capacityBytes(16, 16);
    const tooBig = "x".repeat(cap + 50);
    await expect(embedMessage(carrier, tooBig)).rejects.toThrow(/too large/i);
  });

  it("rejects a non-PNG carrier", async () => {
    const notPng = Buffer.from("not an image");
    await expect(embedMessage(notPng, "hi")).rejects.toThrow();
  });

  it("fails to find a message in an unmodified carrier", async () => {
    const carrier = await makeSampleCarrier(64, 64);
    // Fresh carrier has arbitrary LSBs; extraction should either throw or not
    // return our known message.
    try {
      const { message } = await extractMessage(carrier);
      expect(message).not.toBe("hidden message!");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });
});
