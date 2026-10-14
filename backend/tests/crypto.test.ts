import { describe, it, expect } from "vitest";
import { sha256Hex } from "../src/crypto/hashing.js";
import {
  canonicalize,
  canonicalBuffer,
  CANONICAL_VERSION,
} from "../src/crypto/canonical.js";
import {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
} from "../src/crypto/signing.js";

const sampleMeta = {
  certificateId: "TEST-0001",
  studentName: "Test Student",
  studentIdentifier: "STU-0001",
  institutionName: "Test University",
  qualification: "B.Tech CSE",
  graduationYear: 2024,
  issueDate: "2024-06-01",
  documentHash: "a".repeat(64),
  issuerCode: "CGDU-001",
};

describe("SHA-256 hashing", () => {
  it("produces the same digest for identical bytes", () => {
    const a = Buffer.from("hello world");
    const b = Buffer.from("hello world");
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it("produces a different digest when a single byte changes", () => {
    const original = Buffer.from("hello world");
    const modified = Buffer.from("hello worlx");
    expect(sha256Hex(original)).not.toBe(sha256Hex(modified));
  });

  it("matches the known SHA-256 digest of an empty input", () => {
    // Well-known SHA-256 of the empty string.
    expect(sha256Hex(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

describe("Canonicalization", () => {
  it("is deterministic for identical metadata", () => {
    expect(canonicalize(sampleMeta)).toBe(canonicalize({ ...sampleMeta }));
  });

  it("embeds the versioned header", () => {
    expect(canonicalize(sampleMeta).startsWith(`CERTIGUARD-CANONICAL/v${CANONICAL_VERSION}`)).toBe(true);
  });

  it("changes when a signed field changes", () => {
    const changed = { ...sampleMeta, studentName: "Different Name" };
    expect(canonicalize(sampleMeta)).not.toBe(canonicalize(changed));
  });

  it("rejects an unsupported canonical version", () => {
    expect(() => canonicalize(sampleMeta, "9.9")).toThrow();
  });
});

describe("Ed25519 digital signatures", () => {
  it("verifies a valid signature", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    const data = canonicalBuffer(sampleMeta);
    const sig = signEd25519(data, privateKeyPem);
    expect(verifyEd25519(data, sig, publicKeyPem)).toBe(true);
  });

  it("fails verification when signed metadata is modified", () => {
    const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
    const sig = signEd25519(canonicalBuffer(sampleMeta), privateKeyPem);
    const tampered = canonicalBuffer({ ...sampleMeta, qualification: "M.Tech" });
    expect(verifyEd25519(tampered, sig, publicKeyPem)).toBe(false);
  });

  it("fails verification with a wrong public key", () => {
    const signer = generateEd25519KeyPair();
    const other = generateEd25519KeyPair();
    const data = canonicalBuffer(sampleMeta);
    const sig = signEd25519(data, signer.privateKeyPem);
    expect(verifyEd25519(data, sig, other.publicKeyPem)).toBe(false);
  });

  it("handles a malformed signature safely (returns false, no throw)", () => {
    const { publicKeyPem } = generateEd25519KeyPair();
    const data = canonicalBuffer(sampleMeta);
    expect(verifyEd25519(data, "not-a-valid-base64-signature!!!", publicKeyPem)).toBe(false);
  });

  it("handles a malformed public key safely (returns false, no throw)", () => {
    const { privateKeyPem } = generateEd25519KeyPair();
    const data = canonicalBuffer(sampleMeta);
    const sig = signEd25519(data, privateKeyPem);
    expect(verifyEd25519(data, sig, "-----BEGIN PUBLIC KEY-----\ngarbage\n-----END PUBLIC KEY-----")).toBe(false);
  });
});
