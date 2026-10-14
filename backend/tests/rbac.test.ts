import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let issuer: AuthedUser, verifier: AuthedUser, student: AuthedUser, admin: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "i@rbac.test", password: "IssuerPass123!", role: "institution_issuer" });
  h.createUser({ email: "v@rbac.test", password: "VerifyPass123!", role: "company_verifier" });
  h.createUser({ email: "s@rbac.test", password: "StudentPass123!", role: "student", studentIdentifier: "STU-RBAC-1" });
  issuer = await h.login("i@rbac.test", "IssuerPass123!");
  verifier = await h.login("v@rbac.test", "VerifyPass123!");
  student = await h.login("s@rbac.test", "StudentPass123!");
  admin = await h.adminLogin();
});
afterAll(() => cleanupHarness(h));

const regBody = (r: request.Test) =>
  r.field("certificateId", "RBAC-CERT").field("studentName", "X").field("studentIdentifier", "STU-RBAC-1")
    .field("institutionName", "Inst").field("qualification", "Q").field("graduationYear", "2024").field("issueDate", "2024-01-01");

describe("RBAC enforcement (backend)", () => {
  it("student CANNOT register certificates (403)", async () => {
    const pdf = h.makeMinimalPdf("x");
    const res = await regBody(
      request(h.app).post("/api/certificates").set("Cookie", student.cookie).set("X-CSRF-Token", student.csrfToken)
    ).attach("file", pdf, "c.pdf");
    expect(res.status).toBe(403);
  });

  it("verifier CANNOT register certificates (403)", async () => {
    const pdf = h.makeMinimalPdf("x");
    const res = await regBody(
      request(h.app).post("/api/certificates").set("Cookie", verifier.cookie).set("X-CSRF-Token", verifier.csrfToken)
    ).attach("file", pdf, "c.pdf");
    expect(res.status).toBe(403);
  });

  it("issuer CAN register certificates (201)", async () => {
    const pdf = h.makeMinimalPdf("ok");
    const res = await regBody(
      request(h.app).post("/api/certificates").set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken)
    ).attach("file", pdf, "c.pdf");
    expect(res.status).toBe(201);
  });

  it("issuer CANNOT access user management (403)", async () => {
    const res = await request(h.app).get("/api/users").set("Cookie", issuer.cookie);
    expect(res.status).toBe(403);
  });

  it("non-admins CANNOT access audit logs (403)", async () => {
    for (const u of [issuer, verifier, student]) {
      const res = await request(h.app).get("/api/audit").set("Cookie", u.cookie);
      expect(res.status).toBe(403);
    }
  });

  it("non-admins CANNOT access incidents / security events (403)", async () => {
    expect((await request(h.app).get("/api/incidents").set("Cookie", verifier.cookie)).status).toBe(403);
    expect((await request(h.app).get("/api/security/events").set("Cookie", issuer.cookie)).status).toBe(403);
  });

  it("admin CAN access user management, audit, security, incidents", async () => {
    expect((await request(h.app).get("/api/users").set("Cookie", admin.cookie)).status).toBe(200);
    expect((await request(h.app).get("/api/audit").set("Cookie", admin.cookie)).status).toBe(200);
    expect((await request(h.app).get("/api/security/events").set("Cookie", admin.cookie)).status).toBe(200);
    expect((await request(h.app).get("/api/incidents").set("Cookie", admin.cookie)).status).toBe(200);
  });

  it("a student CANNOT view another student's certificate by changing the URL (403)", async () => {
    // Issuer registers a cert for a DIFFERENT student identifier.
    const pdf = h.makeMinimalPdf("other");
    await request(h.app).post("/api/certificates").set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken)
      .field("certificateId", "OTHER-STU-CERT").field("studentName", "Other").field("studentIdentifier", "STU-OTHER-9")
      .field("institutionName", "Inst").field("qualification", "Q").field("graduationYear", "2024").field("issueDate", "2024-01-01")
      .attach("file", pdf, "c.pdf");
    const res = await request(h.app).get("/api/certificates/OTHER-STU-CERT").set("Cookie", student.cookie);
    expect(res.status).toBe(403);
  });

  it("unauthenticated access is denied (401)", async () => {
    expect((await request(h.app).get("/api/users")).status).toBe(401);
    expect((await request(h.app).get("/api/dashboard")).status).toBe(401);
  });
});
