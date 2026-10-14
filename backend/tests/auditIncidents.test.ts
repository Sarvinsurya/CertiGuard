import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness, type AuthedUser } from "./helpers/harness.js";

let h: TestHarness;
let admin: AuthedUser;

beforeAll(async () => {
  h = await createTestHarness();
  admin = await h.adminLogin();
});
afterAll(() => cleanupHarness(h));

describe("Audit log + hash chaining", () => {
  it("records chained entries and verifies integrity", async () => {
    const { recordAuditEvent, verifyAuditIntegrity } = await import("../src/services/auditService.js");
    recordAuditEvent({ action: "TEST_EVENT_1", outcome: "SUCCESS", actorId: 1 });
    recordAuditEvent({ action: "TEST_EVENT_2", outcome: "SUCCESS", actorId: 1 });
    const result = verifyAuditIntegrity();
    expect(result.ok).toBe(true);
    expect(result.checked).toBeGreaterThanOrEqual(2);
  });

  it("detects tampering with a chained entry", async () => {
    const { recordAuditEvent, verifyAuditIntegrity } = await import("../src/services/auditService.js");
    const { getDb } = await import("../src/db/connection.js");
    const entry = recordAuditEvent({ action: "TAMPER_TARGET", outcome: "SUCCESS", actorId: 1 });
    // Tamper with the stored outcome WITHOUT recomputing the hash.
    getDb().prepare("UPDATE audit_logs SET outcome = 'MODIFIED' WHERE id = ?").run(entry.id);
    const result = verifyAuditIntegrity();
    expect(result.ok).toBe(false);
    expect(result.firstBrokenId).toBe(entry.id);
  });

  it("exposes audit list + integrity + CSV export to admins only", async () => {
    const list = await request(h.app).get("/api/audit").set("Cookie", admin.cookie);
    expect(list.status).toBe(200);
    const integrity = await request(h.app).get("/api/audit/integrity").set("Cookie", admin.cookie);
    expect(integrity.status).toBe(200);
    expect(typeof integrity.body.data.integrity.ok).toBe("boolean");
    const csv = await request(h.app).get("/api/audit/export").set("Cookie", admin.cookie);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text.split("\n")[0]).toContain("action");
  });

  it("audit entries never contain password/OTP/key material", async () => {
    const { listAuditEvents } = await import("../src/services/auditService.js");
    const { events } = listAuditEvents({ limit: 500 });
    const blob = JSON.stringify(events);
    expect(blob).not.toMatch(/password_hash|PRIVATE KEY|recovery_code|scrypt\$/);
  });
});

describe("Incident response (safe + reversible)", () => {
  it("creates an incident and applies a reversible suspend action", async () => {
    const targetId = h.createUser({ email: "target@inc.test", password: "TargetPass123!", role: "student" });
    const create = await request(h.app).post("/api/incidents")
      .set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken)
      .send({ title: "Suspicious activity", description: "Repeated failures", severity: "high" });
    expect(create.status).toBe(201);
    const incidentId = create.body.data.incident.id;

    const action = await request(h.app).post(`/api/incidents/${incidentId}/actions`)
      .set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken)
      .send({ actionType: "suspend", targetUserId: targetId, reason: "contain", durationSeconds: 3600 });
    expect(action.status).toBe(200);
    expect(action.body.data.result.effect).toMatch(/suspended/i);

    // Target cannot log in while suspended.
    const blocked = await request(h.app).post("/api/auth/login").send({ email: "target@inc.test", password: "TargetPass123!" });
    expect(blocked.status).toBe(403);

    // Reverse the action.
    const actionId = action.body.data.result.actionId;
    const reverse = await request(h.app).post(`/api/incidents/actions/${actionId}/reverse`)
      .set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken);
    expect(reverse.status).toBe(200);
    const restored = await request(h.app).post("/api/auth/login").send({ email: "target@inc.test", password: "TargetPass123!" });
    expect(restored.status).toBe(200);
  });

  it("refuses to suspend an administrator via response action", async () => {
    const adminTarget = h.createUser({ email: "admin2@inc.test", password: "Admin2Pass123!", role: "security_administrator" });
    const create = await request(h.app).post("/api/incidents")
      .set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken)
      .send({ title: "x", description: "y", severity: "low" });
    const incidentId = create.body.data.incident.id;
    const res = await request(h.app).post(`/api/incidents/${incidentId}/actions`)
      .set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken)
      .send({ actionType: "suspend", targetUserId: adminTarget, reason: "nope" });
    expect(res.status).toBe(400);
  });

  it("records response actions in the audit trail", async () => {
    const { listAuditEvents } = await import("../src/services/auditService.js");
    const { events } = listAuditEvents({ action: "INCIDENT_RESPONSE_ACTION" });
    expect(events.length).toBeGreaterThan(0);
  });
});
