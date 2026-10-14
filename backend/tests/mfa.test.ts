import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { authenticator } from "otplib";
import { createTestHarness, cleanupHarness, type TestHarness } from "./helpers/harness.js";

let h: TestHarness;
let userId: number;
let mfa: typeof import("../src/services/mfaService.js");

beforeAll(async () => {
  h = await createTestHarness();
  userId = h.createUser({ email: "mfa@test.certiguard", password: "MfaPass123!", role: "company_verifier" });
  mfa = await import("../src/services/mfaService.js");
});
afterAll(() => cleanupHarness(h));

/** Read the (encrypted) secret back by decrypting it the same way the service does. */
async function currentSecret(uid: number): Promise<string> {
  const { getDb } = await import("../src/db/connection.js");
  const { loadMfaKey } = await import("../src/crypto/keyManager.js");
  const { decryptData } = await import("../src/crypto/aesgcm.js");
  const row = getDb().prepare("SELECT secret_encrypted FROM user_mfa WHERE user_id = ?").get(uid) as { secret_encrypted: string };
  return decryptData(JSON.parse(row.secret_encrypted), loadMfaKey());
}

describe("MFA (TOTP)", () => {
  it("enrollment stores an ENCRYPTED secret and returns recovery codes once", async () => {
    const result = await mfa.beginEnrollment(userId, "mfa@test.certiguard");
    expect(result.qrDataUrl.startsWith("data:image/png")).toBe(true);
    expect(result.recoveryCodes).toHaveLength(10);
    const { getDb } = await import("../src/db/connection.js");
    const row = getDb().prepare("SELECT secret_encrypted FROM user_mfa WHERE user_id = ?").get(userId) as { secret_encrypted: string };
    // Stored value is an AES-GCM payload, not a bare base32 secret.
    expect(row.secret_encrypted).toContain("AES-256-GCM");
  });

  it("rejects an invalid OTP and accepts a valid one; confirmation enables MFA", async () => {
    await mfa.beginEnrollment(userId, "mfa@test.certiguard");
    expect(mfa.confirmEnrollment(userId, "000000")).toBe(false);
    const secret = await currentSecret(userId);
    const token = authenticator.generate(secret);
    expect(mfa.confirmEnrollment(userId, token)).toBe(true);
    expect(mfa.isMfaConfirmed(userId)).toBe(true);
    expect(mfa.verifyTotp(userId, authenticator.generate(secret))).toBe(true);
  });

  it("recovery codes are single-use", async () => {
    const result = await mfa.beginEnrollment(userId, "mfa@test.certiguard");
    const code = result.recoveryCodes[0];
    expect(mfa.consumeRecoveryCode(userId, code)).toBe(true);
    expect(mfa.consumeRecoveryCode(userId, code)).toBe(false); // reuse rejected
    expect(mfa.remainingRecoveryCodes(userId)).toBe(9);
  });

  it("login requires MFA when enabled, then completes with a valid TOTP", async () => {
    // Enroll + confirm + enable via service, then exercise the login flow.
    await mfa.beginEnrollment(userId, "mfa@test.certiguard");
    const secret = await currentSecret(userId);
    mfa.confirmEnrollment(userId, authenticator.generate(secret));
    const { setMfaEnabled } = await import("../src/services/userService.js");
    setMfaEnabled(userId, true);

    const request = (await import("supertest")).default;
    const login = await request(h.app).post("/api/auth/login").send({ email: "mfa@test.certiguard", password: "MfaPass123!" });
    expect(login.status).toBe(200);
    expect(login.body.data.mfaRequired).toBe(true);
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    // Before MFA completion, protected routes are denied.
    const premature = await request(h.app).get("/api/dashboard").set("Cookie", cookie);
    expect(premature.status).toBe(401);

    const verify = await request(h.app).post("/api/auth/mfa/verify")
      .set("Cookie", cookie).set("X-CSRF-Token", login.body.data.csrfToken)
      .send({ token: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    const newCookie = verify.headers["set-cookie"][0].split(";")[0];
    const me = await request(h.app).get("/api/auth/me").set("Cookie", newCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.mfaEnabled).toBe(true);
  });
});
