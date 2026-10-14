import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let issuer: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "issuer@reg.test", password: "IssuerPass123!", role: "institution_issuer", displayName: "Reg Issuer" });
  issuer = await h.login("issuer@reg.test", "IssuerPass123!");
});

afterAll(() => cleanupHarness(h));

function reg(certificateId: string) {
  return request(h.app)
    .post("/api/certificates")
    .set("Cookie", issuer.cookie)
    .set("X-CSRF-Token", issuer.csrfToken)
    .field("certificateId", certificateId)
    .field("studentName", "Alice Example")
    .field("studentIdentifier", "STU-REG-001")
    .field("institutionName", "CertiGuard Demonstration University")
    .field("qualification", "B.Tech CSE")
    .field("graduationYear", "2024")
    .field("issueDate", "2024-06-01");
}

describe("Certificate registration API", () => {
  it("registers a valid certificate (201) and returns a signature + hash", async () => {
    const pdf = h.makeMinimalPdf("Alice Example certificate");
    const res = await reg("REG-0001").attach("file", pdf, "cert.pdf");
    expect(res.status).toBe(201);
    expect(res.body.data.certificate.certificateId).toBe("REG-0001");
    expect(res.body.data.certificate.documentHash).toHaveLength(64);
    expect(typeof res.body.data.certificate.signature).toBe("string");
    expect(res.body.data.certificate.status).toBe("active");
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE KEY");
  });

  it("persists the record (retrievable via GET)", async () => {
    const pdf = h.makeMinimalPdf("Persisted certificate");
    await reg("REG-PERSIST").attach("file", pdf, "cert.pdf");
    const res = await request(h.app).get("/api/certificates/REG-PERSIST").set("Cookie", issuer.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.certificate.certificateId).toBe("REG-PERSIST");
    expect(res.body.data.issuer.publicKey).toContain("PUBLIC KEY");
  });

  it("rejects missing required fields (400)", async () => {
    const pdf = h.makeMinimalPdf("no fields");
    const res = await request(h.app)
      .post("/api/certificates")
      .set("Cookie", issuer.cookie)
      .set("X-CSRF-Token", issuer.csrfToken)
      .field("certificateId", "REG-MISSING")
      .attach("file", pdf, "cert.pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-PDF file (400) via magic-byte check", async () => {
    const notPdf = Buffer.from("this is plain text, not a pdf");
    const res = await reg("REG-NOTPDF").attach("file", notPdf, "cert.pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a request with no file (400)", async () => {
    const res = await reg("REG-NOFILE");
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate certificate ID (409)", async () => {
    const pdf = h.makeMinimalPdf("dup");
    await reg("REG-DUP").attach("file", pdf, "cert.pdf");
    const res = await reg("REG-DUP").attach("file", pdf, "cert.pdf");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects an unauthenticated registration (401)", async () => {
    const pdf = h.makeMinimalPdf("noauth");
    const res = await request(h.app)
      .post("/api/certificates")
      .field("certificateId", "REG-NOAUTH")
      .field("studentName", "X").field("studentIdentifier", "Y")
      .field("institutionName", "Z").field("qualification", "Q")
      .field("graduationYear", "2024").field("issueDate", "2024-06-01")
      .attach("file", pdf, "cert.pdf");
    expect(res.status).toBe(401);
  });
});
