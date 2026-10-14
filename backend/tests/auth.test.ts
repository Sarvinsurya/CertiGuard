import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestHarness, cleanupHarness, type TestHarness } from "./helpers/harness.js";
import { hashPassword, verifyPassword } from "../src/services/passwordService.js";

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
  h.createUser({ email: "user@auth.test", password: "UserPass123!", role: "company_verifier", displayName: "Auth User" });
});
afterAll(() => cleanupHarness(h));

describe("Password hashing", () => {
  it("hashes and verifies, rejects wrong password", () => {
    const hash = hashPassword("Secret123!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Secret123!", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
  it("does not store plaintext", () => {
    expect(hashPassword("Plaintext123!")).not.toContain("Plaintext123!");
  });
});

describe("Authentication API", () => {
  it("valid login sets an HttpOnly session cookie and returns csrfToken", async () => {
    const res = await request(h.app).post("/api/auth/login").send({ email: "user@auth.test", password: "UserPass123!" });
    expect(res.status).toBe(200);
    expect(res.body.data.csrfToken).toBeTruthy();
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("invalid password returns a generic 401", async () => {
    const res = await request(h.app).post("/api/auth/login").send({ email: "user@auth.test", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/invalid email or password/i);
  });

  it("unknown account returns the same generic 401 (no account enumeration)", async () => {
    const res = await request(h.app).post("/api/auth/login").send({ email: "ghost@auth.test", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/invalid email or password/i);
  });

  it("/me requires a session", async () => {
    const res = await request(h.app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("logout revokes the session", async () => {
    const login = await request(h.app).post("/api/auth/login").send({ email: "user@auth.test", password: "UserPass123!" });
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const csrf = login.body.data.csrfToken;
    const me1 = await request(h.app).get("/api/auth/me").set("Cookie", cookie);
    expect(me1.status).toBe(200);
    await request(h.app).post("/api/auth/logout").set("Cookie", cookie).set("X-CSRF-Token", csrf);
    const me2 = await request(h.app).get("/api/auth/me").set("Cookie", cookie);
    expect(me2.status).toBe(401);
  });

  it("deactivated account cannot log in", async () => {
    h.createUser({ email: "inactive@auth.test", password: "InactivePass123!", role: "student" });
    const admin = await h.adminLogin();
    const { findUserByEmail } = await import("../src/services/userService.js");
    const target = findUserByEmail("inactive@auth.test")!;
    await request(h.app).post(`/api/users/${target.id}/deactivate`).set("Cookie", admin.cookie).set("X-CSRF-Token", admin.csrfToken);
    const res = await request(h.app).post("/api/auth/login").send({ email: "inactive@auth.test", password: "InactivePass123!" });
    expect(res.status).toBe(403);
  });

  it("password reset issues a single-use token and invalidates it after use", async () => {
    h.createUser({ email: "reset@auth.test", password: "ResetPass123!", role: "student" });
    const forgot = await request(h.app).post("/api/auth/password/forgot").send({ email: "reset@auth.test" });
    const token = forgot.body.data.resetTokenDev;
    expect(token).toBeTruthy();
    const reset = await request(h.app).post("/api/auth/password/reset").send({ token, newPassword: "NewReset123!" });
    expect(reset.status).toBe(200);
    const reuse = await request(h.app).post("/api/auth/password/reset").send({ token, newPassword: "Another123!" });
    expect(reuse.status).toBe(400);
    const login = await request(h.app).post("/api/auth/login").send({ email: "reset@auth.test", password: "NewReset123!" });
    expect(login.status).toBe(200);
  });

  it("login throttling returns 429 after too many attempts", async () => {
    let got429 = false;
    for (let i = 0; i < 14; i++) {
      const res = await request(h.app).post("/api/auth/login").send({ email: "user@auth.test", password: "bad" });
      if (res.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });
});
