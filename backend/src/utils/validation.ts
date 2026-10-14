import { z } from "zod";

const currentYear = new Date().getFullYear();

export const registerCertificateSchema = z.object({
  certificateId: z
    .string()
    .trim()
    .min(3, "Certificate ID must be at least 3 characters")
    .max(100, "Certificate ID is too long")
    .regex(/^[A-Za-z0-9._/-]+$/, "Certificate ID has invalid characters"),
  studentName: z.string().trim().min(1, "Student name is required").max(200),
  studentIdentifier: z
    .string()
    .trim()
    .min(1, "Student identifier is required")
    .max(100),
  institutionName: z.string().trim().min(1, "Institution name is required").max(200),
  qualification: z.string().trim().min(1, "Qualification is required").max(200),
  graduationYear: z.coerce
    .number()
    .int("Graduation year must be an integer")
    .min(1900, "Graduation year is out of range")
    .max(currentYear + 1, "Graduation year is out of range"),
  issueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Issue date must be in YYYY-MM-DD format"),
});

export type RegisterCertificateInput = z.infer<typeof registerCertificateSchema>;

export const revokeCertificateSchema = z.object({
  reason: z.string().trim().min(1, "Revocation reason is required").max(500),
});

export const signatureDemoSchema = z.object({
  record: z.object({
    certificateId: z.string().trim().min(1).max(100),
    studentName: z.string().trim().min(1).max(200),
    studentIdentifier: z.string().trim().min(1).max(100),
    institutionName: z.string().trim().min(1).max(200),
    qualification: z.string().trim().min(1).max(200),
    graduationYear: z.coerce.number().int().min(1900).max(currentYear + 1),
    issueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    documentHash: z.string().trim().min(1).max(128),
  }),
  // Optional tampered record to demonstrate signature failure.
  tamperedRecord: z
    .object({
      certificateId: z.string().trim().min(1).max(100),
      studentName: z.string().trim().min(1).max(200),
      studentIdentifier: z.string().trim().min(1).max(100),
      institutionName: z.string().trim().min(1).max(200),
      qualification: z.string().trim().min(1).max(200),
      graduationYear: z.coerce.number().int().min(1900).max(currentYear + 1),
      issueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
      documentHash: z.string().trim().min(1).max(128),
    })
    .optional(),
});

export type SignatureDemoInput = z.infer<typeof signatureDemoSchema>;

/* -------------------------------------------------------------------------- */
/* Phase 2: privacy endpoint schemas                                          */
/* -------------------------------------------------------------------------- */

export const encryptSchema = z.object({
  plaintext: z.string().min(1, "Plaintext is required").max(10000),
});

const encryptedPayloadSchema = z.object({
  alg: z.literal("AES-256-GCM"),
  v: z.number(),
  nonce: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1),
  encoding: z.literal("base64"),
});

export const decryptSchema = z.object({
  payload: encryptedPayloadSchema,
});

export const piiDetectSchema = z.object({
  text: z.string().min(1, "Text is required").max(20000),
});

const maskStrategyEnum = z.enum(["email", "phone", "id", "name", "full", "partial"]);

export const maskingSchema = z.object({
  fields: z
    .array(
      z.object({
        field: z.string().min(1).max(100),
        value: z.string().max(500),
        strategy: maskStrategyEnum,
        visible: z.coerce.number().int().min(0).max(20).optional(),
      })
    )
    .min(1)
    .max(20),
});

export const pseudonymizeSchema = z.object({
  identifier: z.string().min(1, "Identifier is required").max(200),
  scope: z.string().max(100).optional(),
  keyVersion: z.coerce.number().int().min(1).max(999).optional(),
  includePlainHashDemo: z.boolean().optional(),
});

export const minimizationSchema = z.object({
  operation: z.enum(["verification", "publicStatus", "maskedDisplay", "fullAdmin"]),
  record: z.record(z.unknown()).optional(),
});

export const stegoEmbedSchema = z.object({
  message: z.string().min(1, "Message is required").max(5000),
});

/* -------------------------------------------------------------------------- */
/* Identity & Access schemas                                                  */
/* -------------------------------------------------------------------------- */

export const loginSchema = z.object({
  email: z.string().trim().email("A valid email is required").max(200),
  password: z.string().min(1, "Password is required").max(200),
});

export const mfaVerifySchema = z.object({
  token: z.string().trim().min(6).max(10).optional(),
  recoveryCode: z.string().trim().min(6).max(20).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, "Password must be at least 10 characters").max(200),
});

export const passwordForgotSchema = z.object({
  email: z.string().trim().email().max(200),
});

export const passwordResetSchema = z.object({
  token: z.string().trim().min(10).max(200),
  newPassword: z.string().min(10, "Password must be at least 10 characters").max(200),
});

export const mfaConfirmSchema = z.object({
  token: z.string().trim().min(6).max(10),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1).max(200),
  token: z.string().trim().min(6).max(10),
});

export const createUserSchema = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(["institution_issuer", "company_verifier", "student", "security_administrator"]),
  password: z.string().min(10).max(200),
  organizationName: z.string().trim().max(200).optional(),
  studentIdentifier: z.string().trim().max(100).optional(),
  mustChangePassword: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  organizationId: z.coerce.number().int().positive().nullable().optional(),
});

export const assignRoleSchema = z.object({
  role: z.enum(["institution_issuer", "company_verifier", "student", "security_administrator"]),
});

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  subjectType: z.string().trim().max(50).optional(),
  subjectId: z.string().trim().max(100).optional(),
});

export const incidentActionSchema = z.object({
  actionType: z.enum(["throttle", "suspend", "revoke_sessions", "require_password_reset", "require_mfa", "flag_review"]),
  targetUserId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
});

export const incidentStatusSchema = z.object({
  status: z.enum(["open", "investigating", "contained", "resolved", "false_positive"]),
  notes: z.string().trim().max(2000).optional(),
});
