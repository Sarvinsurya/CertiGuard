import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { authenticate } from "../middleware/auth.js";
import {
  postLogin, postMfaVerify, postLogout, getMe, postPasswordChange,
  postPasswordForgot, postPasswordReset, postMfaEnroll, postMfaConfirm,
  postMfaDisable, getSessions, deleteSession,
} from "../controllers/authController.js";

export const authRouter = Router();

const loginLimit = rateLimit({ category: "auth-login", windowMs: 60_000, max: 10, by: "ip" });
const mfaLimit = rateLimit({ category: "auth-mfa", windowMs: 60_000, max: 10, by: "ip+user" });
const resetLimit = rateLimit({ category: "auth-reset", windowMs: 60_000, max: 5, by: "ip" });

authRouter.post("/login", loginLimit, postLogin);
authRouter.post("/mfa/verify", mfaLimit, postMfaVerify);
authRouter.post("/logout", postLogout);
authRouter.get("/me", getMe);

authRouter.post("/password/change", authenticate, postPasswordChange);
authRouter.post("/password/forgot", resetLimit, postPasswordForgot);
authRouter.post("/password/reset", resetLimit, postPasswordReset);

authRouter.post("/mfa/enroll", authenticate, postMfaEnroll);
authRouter.post("/mfa/confirm", authenticate, postMfaConfirm);
authRouter.post("/mfa/disable", authenticate, postMfaDisable);

authRouter.get("/sessions", authenticate, getSessions);
authRouter.delete("/sessions/:id", authenticate, deleteSession);
