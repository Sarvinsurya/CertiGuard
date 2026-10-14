import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let issuer: AuthedUser;
let verifier: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "issuer@ver.test", password: "IssuerPass123!", role: "institution_issuer" });
  h.createUser({ email: "verifier@ver.test", password: "VerifyPass123!", role: "company_verifier" });
  issuer = await h.login("issuer@ver.test", "IssuerPass123!");
  verifier = await h.login("verifier@ver.test", "VerifyPass123!");
});

afterAll(() => cleanupHarness(h));

async function registerCert(id: string, text: string) {
  const pdf = h.makeMinimalPdf(text);
  const res = await request(h.app)
    .post("/api/certificates")
    .set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken)
    .field("certificateId", id)
    .field("studentName", "Bob Verifier").field("studentIdentifier", "STU-VER-001")
    .field("institutionName", "CertiGuard Demonstration University")
    .field("qualification", "B.Sc Infosec").field("graduationYear", "2023").field("issueDate", "2023-05-10")
    .attach("file", pdf, "cert.pdf");
  expect(res.status).toBe(201);
  return pdf;
}

function verify(id: string, pdf: Buffer) {
  return request(h.app)
    .post("/api/verify")
    .set("Cookie", verifier.cookie).set("X-CSRF-Token", verifier.csrfToken)
    .field("certificateId", id).attach("file", pdf, "cert.pdf");
}

function revoke(id: string, reason: string) {
  return request(h.app)
    .post(`/api/certificates/${id}/revoke`)
    .set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken)
    .send({ reason });
}

describe("Certificate verification API", () => {
  it("VERIFIED: genuine registered PDF with all checks passing", async () => {
    const pdf = await registerCert("VER-GENUINE", "genuine doc");
    const res = await verify("VER-GENUINE", pdf);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.checks).toEqual({ record: "FOUND", integrity: "MATCH", signature: "VALID", revocation: "ACTIVE" });
    expect(d.overall).toBe("VERIFIED");
  });

  it("DOCUMENT_MISMATCH: different PDF for a registered ID", async () => {
    await registerCert("VER-MISMATCH", "original doc");
    const modified = h.makeMinimalPdf("modified doc with different bytes");
    const res = await verify("VER-MISMATCH", modified);
    expect(res.body.data.checks.integrity).toBe("MISMATCH");
    expect(res.body.data.overall).toBe("DOCUMENT_MISMATCH");
  });

  it("NOT_REGISTERED: unknown certificate ID", async () => {
    const pdf = h.makeMinimalPdf("unknown");
    const res = await verify("DOES-NOT-EXIST", pdf);
    expect(res.body.data.overall).toBe("NOT_REGISTERED");
  });

  it("REVOKED (not VERIFIED) even though hash matches + signature valid", async () => {
    const pdf = await registerCert("VER-REVOKED-FLOW", "to be revoked");
    let res = await verify("VER-REVOKED-FLOW", pdf);
    expect(res.body.data.overall).toBe("VERIFIED");
    await revoke("VER-REVOKED-FLOW", "test revocation");
    res = await verify("VER-REVOKED-FLOW", pdf);
    const d = res.body.data;
    expect(d.checks.integrity).toBe("MATCH");
    expect(d.checks.signature).toBe("VALID");
    expect(d.checks.revocation).toBe("REVOKED");
    expect(d.overall).toBe("REVOKED");
  });

  it("INVALID_SIGNATURE: tampering with stored signed metadata is detected", async () => {
    const pdf = await registerCert("VER-TAMPER", "sig tamper doc");
    const { getDb } = await import("../src/db/connection.js");
    getDb().prepare("UPDATE certificates SET student_name = ? WHERE certificate_id = ?").run("TAMPERED NAME", "VER-TAMPER");
    const res = await verify("VER-TAMPER", pdf);
    const d = res.body.data;
    expect(d.checks.integrity).toBe("MATCH");
    expect(d.checks.signature).toBe("INVALID");
    expect(d.overall).toBe("INVALID_SIGNATURE");
  });

  it("rejects verification with no certificate ID (400)", async () => {
    const pdf = h.makeMinimalPdf("x");
    const res = await request(h.app).post("/api/verify")
      .set("Cookie", verifier.cookie).set("X-CSRF-Token", verifier.csrfToken)
      .attach("file", pdf, "cert.pdf");
    expect(res.status).toBe(400);
  });
});
