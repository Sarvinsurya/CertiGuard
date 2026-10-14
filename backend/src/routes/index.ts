import { Router } from "express";
import { uploadSinglePdf } from "../middleware/upload.js";
import { sendSuccess } from "../utils/response.js";
import { getSchemaVersion } from "../db/migrator.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { PERMISSIONS } from "../auth/rbac.js";
import {
  postCertificate,
  getCertificates,
  getCertificate,
  postRevoke,
} from "../controllers/certificateController.js";
import { postVerify } from "../controllers/verificationController.js";
import { postHashLab, postSignatureDemo } from "../controllers/labController.js";
import { getIssuers, getIssuer } from "../controllers/issuerController.js";
import { getDashboard } from "../controllers/dashboardController.js";
import { privacyRouter } from "./privacy.js";
import { authRouter } from "./auth.js";
import { usersRouter, securityRouter, incidentsRouter, auditRouter } from "./admin.js";

export const apiRouter = Router();

// Health (public)
apiRouter.get("/health", (_req, res) => {
  sendSuccess(res, {
    status: "ok",
    service: "certiguard-backend",
    schemaVersion: getSchemaVersion(),
    time: new Date().toISOString(),
  });
});

// Identity & Access
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);

// Security Operations + Audit
apiRouter.use("/security", securityRouter);
apiRouter.use("/incidents", incidentsRouter);
apiRouter.use("/audit", auditRouter);

// Role-aware dashboard
apiRouter.get("/dashboard", authenticate, getDashboard);

// Issuers (public key material only) — authenticated
apiRouter.get("/issuers", authenticate, getIssuers);
apiRouter.get("/issuers/:id", authenticate, getIssuer);

// Certificates (backend-enforced permissions)
const registerLimit = rateLimit({ category: "cert-register", windowMs: 60_000, max: 30, by: "ip+user" });
const verifyLimit = rateLimit({ category: "cert-verify", windowMs: 60_000, max: 30, by: "ip+user" });

apiRouter.post("/certificates", authenticate, requirePermission(PERMISSIONS.CERT_REGISTER), registerLimit, uploadSinglePdf, postCertificate);
apiRouter.get("/certificates", authenticate, requirePermission(PERMISSIONS.CERT_VIEW), getCertificates);
apiRouter.get("/certificates/:certificateId", authenticate, getCertificate); // ownership enforced in controller
apiRouter.post("/certificates/:certificateId/revoke", authenticate, requirePermission(PERMISSIONS.CERT_REVOKE), postRevoke);

// Verification
apiRouter.post("/verify", authenticate, requirePermission(PERMISSIONS.CERT_VERIFY), verifyLimit, uploadSinglePdf, postVerify);

// Crypto labs (authenticated; privacy permission)
apiRouter.post("/lab/hash", authenticate, requirePermission(PERMISSIONS.PRIVACY_USE), uploadSinglePdf, postHashLab);
apiRouter.post("/lab/signature-demo", authenticate, requirePermission(PERMISSIONS.PRIVACY_USE), postSignatureDemo);

// Privacy & information-protection labs
apiRouter.use("/privacy", authenticate, requirePermission(PERMISSIONS.PRIVACY_USE), privacyRouter);
