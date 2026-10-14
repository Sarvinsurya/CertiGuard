import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let issuer: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "issuer@lab.test", password: "IssuerPass123!", role: "institution_issuer" });
  issuer = await h.login("issuer@lab.test", "IssuerPass123!");
});

afterAll(() => cleanupHarness(h));

const auth = (r: request.Test) => r.set("Cookie", issuer.cookie).set("X-CSRF-Token", issuer.csrfToken);

describe("Health + Labs API", () => {
  it("GET /api/health returns ok with schema version (public)", async () => {
    const res = await request(h.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.schemaVersion).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/issuers requires auth and never exposes private keys", async () => {
    const unauth = await request(h.app).get("/api/issuers");
    expect(unauth.status).toBe(401);
    const res = await request(h.app).get("/api/issuers").set("Cookie", issuer.cookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE KEY");
    expect(res.body.data.issuers[0].publicKey).toContain("PUBLIC KEY");
  });

  it("POST /api/lab/hash computes a real SHA-256 of the uploaded PDF", async () => {
    const pdf = h.makeMinimalPdf("hash lab");
    const res = await auth(request(h.app).post("/api/lab/hash")).attach("file", pdf, "x.pdf");
    expect(res.status).toBe(200);
    expect(res.body.data.algorithm).toBe("SHA-256");
    expect(res.body.data.hash).toHaveLength(64);
    expect(res.body.data.fileSizeBytes).toBe(pdf.length);
  });

  it("POST /api/lab/signature-demo: original verifies, tampered fails", async () => {
    const record = {
      certificateId: "LAB-0001", studentName: "Lab Student", studentIdentifier: "LAB-STU-1",
      institutionName: "CertiGuard Demonstration University", qualification: "B.Tech",
      graduationYear: 2024, issueDate: "2024-01-01", documentHash: "b".repeat(64),
    };
    const tamperedRecord = { ...record, studentName: "Tampered Student" };
    const res = await auth(request(h.app).post("/api/lab/signature-demo")).send({ record, tamperedRecord });
    expect(res.status).toBe(200);
    expect(res.body.data.originalVerified).toBe(true);
    expect(res.body.data.tampered.verified).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("PRIVATE KEY");
  });
});
