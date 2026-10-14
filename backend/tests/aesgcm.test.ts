import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  encryptData,
  decryptData,
  DecryptionError,
  type EncryptedPayload,
} from "../src/crypto/aesgcm.js";

const key = () => crypto.randomBytes(32);

describe("AES-256-GCM", () => {
  it("encrypts and decrypts round-trip", () => {
    const k = key();
    const payload = encryptData("sensitive data 123", k);
    expect(payload.alg).toBe("AES-256-GCM");
    expect(decryptData(payload, k)).toBe("sensitive data 123");
  });

  it("rejects decryption with an incorrect key", () => {
    const payload = encryptData("hello", key());
    expect(() => decryptData(payload, key())).toThrow(DecryptionError);
  });

  it("rejects modified ciphertext (authentication failure)", () => {
    const k = key();
    const payload = encryptData("hello world", k);
    const bytes = Buffer.from(payload.ciphertext, "base64");
    bytes[0] ^= 0xff;
    const tampered: EncryptedPayload = { ...payload, ciphertext: bytes.toString("base64") };
    expect(() => decryptData(tampered, k)).toThrow(DecryptionError);
  });

  it("rejects a modified authentication tag", () => {
    const k = key();
    const payload = encryptData("hello world", k);
    const tag = Buffer.from(payload.tag, "base64");
    tag[0] ^= 0xff;
    const tampered: EncryptedPayload = { ...payload, tag: tag.toString("base64") };
    expect(() => decryptData(tampered, k)).toThrow(DecryptionError);
  });

  it("rejects an invalid nonce length", () => {
    const k = key();
    const payload = encryptData("x", k);
    const bad: EncryptedPayload = { ...payload, nonce: Buffer.alloc(8).toString("base64") };
    expect(() => decryptData(bad, k)).toThrow(DecryptionError);
  });

  it("rejects an unsupported payload version", () => {
    const k = key();
    const payload = encryptData("x", k);
    expect(() => decryptData({ ...payload, v: 999 }, k)).toThrow(DecryptionError);
  });

  it("generates a unique nonce per encryption operation", () => {
    const k = key();
    const nonces = new Set<string>();
    for (let i = 0; i < 200; i++) nonces.add(encryptData("same text", k).nonce);
    expect(nonces.size).toBe(200);
  });

  it("rejects a non-32-byte key", () => {
    expect(() => encryptData("x", crypto.randomBytes(16))).toThrow();
  });
});
