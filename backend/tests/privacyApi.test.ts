import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PNG } from "pngjs";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let u: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "verifier@priv.test", password: "VerifyPass123!", role: "company_verifier" });
  u = await h.login("verifier@priv.test", "VerifyPass123!");
});
afterAll(() => cleanupHarness(h));

const post = (p: string) => request(h.app).post(p).set("Cookie", u.cookie).set("X-CSRF-Token", u.csrfToken);
const get = (p: string) => request(h.app).get(p).set("Cookie", u.cookie);

describe("Privacy API — AES-256-GCM", () => {
  it("encrypts then decrypts via the API", async () => {
    const enc = await post("/api/privacy/encrypt").send({ plaintext: "top secret" });
    expect(enc.status).toBe(200);
    expect(enc.body.data.payload.alg).toBe("AES-256-GCM");
    expect(JSON.stringify(enc.body)).not.toMatch(/BEGIN|PRIVATE KEY/);
    const dec = await post("/api/privacy/decrypt").send({ payload: enc.body.data.payload });
    expect(dec.status).toBe(200);
    expect(dec.body.data.plaintext).toBe("top secret");
  });

  it("tampered ciphertext fails authentication (400)", async () => {
    const enc = await post("/api/privacy/encrypt").send({ plaintext: "hi" });
    const payload = enc.body.data.payload;
    const bytes = Buffer.from(payload.ciphertext, "base64");
    bytes[0] ^= 0xff;
    payload.ciphertext = bytes.toString("base64");
    const dec = await post("/api/privacy/decrypt").send({ payload });
    expect(dec.status).toBe(400);
    expect(dec.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication (401)", async () => {
    const res = await request(h.app).post("/api/privacy/encrypt").send({ plaintext: "x" });
    expect(res.status).toBe(401);
  });
});

describe("Privacy API — PII / masking / pseudonymize / minimization", () => {
  it("detects PII", async () => {
    const res = await post("/api/privacy/pii/detect").send({ text: "email me at a@b.com or call 9876543210" });
    expect(res.status).toBe(200);
    expect(res.body.data.countsByCategory.EMAIL).toBe(1);
  });

  it("masks fields", async () => {
    const res = await post("/api/privacy/masking/demo").send({ fields: [{ field: "email", value: "student@example.com", strategy: "email" }] });
    expect(res.status).toBe(200);
    expect(res.body.data.results[0].masked).toBe("s*****t@example.com");
  });

  it("pseudonymizes consistently for same input+scope, differs by scope and input", async () => {
    const a1 = await post("/api/privacy/pseudonymize").send({ identifier: "STU-1" });
    const a2 = await post("/api/privacy/pseudonymize").send({ identifier: "stu-1" });
    const b = await post("/api/privacy/pseudonymize").send({ identifier: "STU-1", scope: "audit" });
    const c = await post("/api/privacy/pseudonymize").send({ identifier: "STU-2" });
    expect(a1.body.data.pseudonym).toBe(a2.body.data.pseudonym);
    expect(a1.body.data.pseudonym).not.toBe(b.body.data.pseudonym);
    expect(a1.body.data.pseudonym).not.toBe(c.body.data.pseudonym);
    expect(a1.body.data.pseudonym.startsWith("PG-")).toBe(true);
    expect(JSON.stringify(a1.body)).not.toMatch(/[0-9a-f]{64}/i);
  });

  it("minimizes a certificate record for verification (allowlist)", async () => {
    const res = await post("/api/privacy/minimization/demo").send({ operation: "verification" });
    expect(res.status).toBe(200);
    expect(res.body.data.includedFields).toContain("qualification");
    expect(res.body.data.excludedFields).toContain("studentEmail");
  });
});

describe("Privacy API — visual cryptography & steganography", () => {
  it("splits a sample secret into two shares", async () => {
    const res = await post("/api/privacy/visual-cryptography/split").send({ text: "CG" });
    expect(res.status).toBe(200);
    expect(res.body.data.share1Base64.length).toBeGreaterThan(0);
    expect(res.body.data.share2Base64.length).toBeGreaterThan(0);
  });

  it("reconstructs from two uploaded shares", async () => {
    const split = await post("/api/privacy/visual-cryptography/split").send({ text: "CG" });
    const s1 = Buffer.from(split.body.data.share1Base64, "base64");
    const s2 = Buffer.from(split.body.data.share2Base64, "base64");
    const res = await post("/api/privacy/visual-cryptography/reconstruct").attach("share1", s1, "s1.png").attach("share2", s2, "s2.png");
    expect(res.status).toBe(200);
    expect(PNG.sync.read(Buffer.from(res.body.data.reconstructedBase64, "base64")).width).toBeGreaterThan(0);
  });

  it("embeds and extracts a hidden message via the API", async () => {
    const sample = await get("/api/privacy/steganography/sample-carrier");
    const carrier = Buffer.from(sample.body.data.carrierBase64, "base64");
    const embed = await post("/api/privacy/steganography/embed").field("message", "api hidden msg").attach("image", carrier, "c.png");
    expect(embed.status).toBe(200);
    const stego = Buffer.from(embed.body.data.pngBase64, "base64");
    const extract = await post("/api/privacy/steganography/extract").attach("image", stego, "s.png");
    expect(extract.status).toBe(200);
    expect(extract.body.data.message).toBe("api hidden msg");
  });
});
