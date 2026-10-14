import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import type { Express } from "express";

export interface AuthedUser {
  cookie: string;
  csrfToken: string;
  userId: number;
  email: string;
  role: string;
}

export interface TestHarness {
  app: Express;
  dataDir: string;
  makeMinimalPdf: (text: string) => Buffer;
  closeDb: () => void;
  bootstrap: () => void;
  createUser: (opts: {
    email: string;
    password: string;
    role: "institution_issuer" | "company_verifier" | "student" | "security_administrator";
    displayName?: string;
    organizationId?: number | null;
    studentIdentifier?: string | null;
  }) => number;
  login: (email: string, password: string) => Promise<AuthedUser>;
  adminLogin: () => Promise<AuthedUser>;
}

const ADMIN_EMAIL = "admin@test.certiguard";
const ADMIN_PASSWORD = "AdminPass123!";

export async function createTestHarness(): Promise<TestHarness> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "certiguard-test-"));
  process.env.CERTIGUARD_DATA_DIR = dataDir;
  process.env.NODE_ENV = "test";
  // Provision an administrator deterministically for tests.
  process.env.CERTIGUARD_ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.CERTIGUARD_ADMIN_PASSWORD = ADMIN_PASSWORD;

  const { bootstrap, createApp } = await import("../../src/app.js");
  const { closeDb } = await import("../../src/db/connection.js");
  const { makeMinimalPdf } = await import("../../src/utils/pdf.js");
  const passwordSvc = await import("../../src/services/passwordService.js");
  const userSvc = await import("../../src/services/userService.js");

  bootstrap();
  const app = createApp();

  function createUser(opts: {
    email: string;
    password: string;
    role: "institution_issuer" | "company_verifier" | "student" | "security_administrator";
    displayName?: string;
    organizationId?: number | null;
    studentIdentifier?: string | null;
  }): number {
    const roleId = userSvc.getRoleIdByName(opts.role as never);
    const row = userSvc.createUser({
      email: opts.email,
      passwordHash: passwordSvc.hashPassword(opts.password),
      displayName: opts.displayName ?? opts.email,
      roleId,
      organizationId: opts.organizationId ?? null,
      studentIdentifier: opts.studentIdentifier ?? null,
      mustChangePassword: false,
    });
    return row.id;
  }

  async function login(email: string, password: string): Promise<AuthedUser> {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    const setCookie = res.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0].split(";")[0] : String(setCookie).split(";")[0];
    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    return {
      cookie,
      csrfToken: res.body.data.csrfToken,
      userId: me.body.data.user.id,
      email,
      role: me.body.data.user.role,
    };
  }

  async function adminLogin(): Promise<AuthedUser> {
    return login(ADMIN_EMAIL, ADMIN_PASSWORD);
  }

  return { app, dataDir, makeMinimalPdf, closeDb, bootstrap, createUser, login, adminLogin };
}

export function cleanupHarness(h: TestHarness): void {
  try {
    h.closeDb();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(h.dataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  delete process.env.CERTIGUARD_ADMIN_EMAIL;
  delete process.env.CERTIGUARD_ADMIN_PASSWORD;
}
