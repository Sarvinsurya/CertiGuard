import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let issuer: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "issuer@rev.test", password: "IssuerPass123!", role: "institution_issuer" });
  issuer = await h.login("issuer@rev.test", "IssuerPass123!");
});

afterAll(() => cleanupHarness(h));

async function registerCert(id: string) {
  const pdf = h.makeMinimalPdf(`revocation ${id}`);
  const res = await request(h.app)
    .post("/api/certificates")
    .set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken)
    .field("certificateId", id)
    .field("studentName", "Carol Revoke").field("studentIdentifier", "STU-REV-001")
    .field("institutionName", "CertiGuard Demonstration University")
    .field("qualification", "M.Tech Cyber Security").field("graduationYear", "2022").field("issueDate", "2022-07-01")
    .attach("file", pdf, "cert.pdf");
  expect(res.status).toBe(201);
  return pdf;
}

function revoke(id: string, body: object) {
  return request(h.app)
    .post(`/api/certificates/${id}/revoke`)
    .set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken)
    .send(body);
}

describe("Certificate revocation API", () => {
  it("revokes an active certificate and stores reason + timestamp", async () => {
    await registerCert("REV-0001");
    const res = await revoke("REV-0001", { reason: "Issued in error" });
    expect(res.status).toBe(200);
    const c = res.body.data.certificate;
    expect(c.status).toBe("revoked");
    expect(c.revocationReason).toBe("Issued in error");
    expect(c.revokedAt).toBeTruthy();
  });

  it("rejects revocation without a reason (400)", async () => {
    await registerCert("REV-NOREASON");
    const res = await revoke("REV-NOREASON", {});
    expect(res.status).toBe(400);
  });

  it("returns 404 when revoking an unknown certificate", async () => {
    const res = await revoke("REV-UNKNOWN", { reason: "x" });
    expect(res.status).toBe(404);
  });

  it("a verifier cannot revoke (403 RBAC)", async () => {
    await registerCert("REV-RBAC");
    h.createUser({ email: "verifier@rev.test", password: "VerifyPass123!", role: "company_verifier" });
    const verifier = await h.login("verifier@rev.test", "VerifyPass123!");
    const res = await request(h.app)
      .post("/api/certificates/REV-RBAC/revoke")
      .set("Cookie", verifier.cookie).set("X-CSRF-Token", verifier.csrfToken)
      .send({ reason: "should be denied" });
    expect(res.status).toBe(403);
  });

  it("handles repeated revocation requests consistently (idempotent)", async () => {
    await registerCert("REV-IDEMPOTENT");
    const first = await revoke("REV-IDEMPOTENT", { reason: "first" });
    expect(first.body.data.certificate.status).toBe("revoked");
    const second = await revoke("REV-IDEMPOTENT", { reason: "second attempt" });
    expect(second.status).toBe(200);
    expect(second.body.data.certificate.status).toBe("revoked");
    expect(second.body.data.certificate.revocationReason).toBe("first");
  });

  it("persists revocation across a database reconnection", async () => {
    await registerCert("REV-PERSIST");
    await revoke("REV-PERSIST", { reason: "persist test" });
    const { closeDb, getDb } = await import("../src/db/connection.js");
    closeDb();
    const row = getDb()
      .prepare("SELECT status, revocation_reason FROM certificates WHERE certificate_id = ?")
      .get("REV-PERSIST") as { status: string; revocation_reason: string };
    expect(row.status).toBe("revoked");
    expect(row.revocation_reason).toBe("persist test");
  });
});
