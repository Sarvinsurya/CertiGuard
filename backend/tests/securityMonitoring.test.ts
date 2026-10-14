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

describe("Rate limiting", () => {
  it("produces real 429 responses with Retry-After once the limit is exceeded", async () => {
    const { resetRateLimiter } = await import("../src/middleware/rateLimit.js");
    resetRateLimiter();
    let got429 = false;
    let retryAfter: string | undefined;
    for (let i = 0; i < 20; i++) {
      const res = await request(h.app).post("/api/auth/login").send({ email: "x@y.z", password: "bad" });
      if (res.status === 429) {
        got429 = true;
        retryAfter = res.headers["retry-after"];
        break;
      }
    }
    expect(got429).toBe(true);
    expect(retryAfter).toBeTruthy();
  });

  it("records a RATE_LIMIT_EXCEEDED security event", async () => {
    const { listSecurityEvents } = await import("../src/services/securityEventService.js");
    const { events } = listSecurityEvents({ eventType: "RATE_LIMIT_EXCEEDED" });
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("Detection rules + risk scoring", () => {
  it("records events, triggers the login-failure rule, and raises a risk score", async () => {
    const { recordSecurityEvent } = await import("../src/services/securityEventService.js");
    const { runDetectionForSubject, DETECTION_RULES, levelForScore } = await import("../src/services/riskService.js");
    // Generate enough AUTH_LOGIN_FAILURE events for one synthetic account.
    for (let i = 0; i < 6; i++) {
      recordSecurityEvent({ eventType: "AUTH_LOGIN_FAILURE", severity: "medium", actorId: 9999, detectionRule: "LOGIN", riskContribution: 6 });
    }
    const { triggeredRuleIds, assessment } = runDetectionForSubject({ actorId: 9999 });
    expect(triggeredRuleIds).toContain("RULE_A_LOGIN_FAILURES");
    const rule = DETECTION_RULES.find((r) => r.id === "RULE_A_LOGIN_FAILURES")!;
    expect(assessment.score).toBeGreaterThanOrEqual(rule.riskWeight);
    expect(assessment.level).toBe(levelForScore(assessment.score));
    expect(assessment.contributingFactors.some((f) => f.ruleId === "RULE_A_LOGIN_FAILURES")).toBe(true);
  });

  it("does not trigger below threshold", async () => {
    const { recordSecurityEvent } = await import("../src/services/securityEventService.js");
    const { runDetectionForSubject } = await import("../src/services/riskService.js");
    recordSecurityEvent({ eventType: "AUTH_LOGIN_FAILURE", severity: "medium", actorId: 8888 });
    const { triggeredRuleIds } = runDetectionForSubject({ actorId: 8888 });
    expect(triggeredRuleIds).not.toContain("RULE_A_LOGIN_FAILURES");
  });

  it("exposes detection rules + security summary to admins", async () => {
    const rules = await request(h.app).get("/api/security/rules").set("Cookie", admin.cookie);
    expect(rules.status).toBe(200);
    expect(rules.body.data.rules.length).toBeGreaterThan(0);
    const summary = await request(h.app).get("/api/security/summary").set("Cookie", admin.cookie);
    expect(summary.status).toBe(200);
    expect(typeof summary.body.data.summary.total).toBe("number");
  });
});

describe("Security simulation", () => {
  it("runs a controlled scenario against the live backend and reports real results", async () => {
    const res = await request(h.app)
      .post("/api/security/simulations/login_failure_burst/run")
      .set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken);
    expect(res.status).toBe(200);
    const r = res.body.data.result;
    expect(r.requestsAttempted).toBeGreaterThan(0);
    expect(r.eventsGenerated).toBeGreaterThan(0);
    expect(r.riskAssessment).toBeTruthy();
  }, 20000);
});
