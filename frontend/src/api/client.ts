import axios, { AxiosError } from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // send the HttpOnly session cookie
});

// CSRF double-submit: attach the current session CSRF token to state-changing requests.
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}
api.interceptors.request.use((cfg) => {
  const method = (cfg.method ?? "get").toUpperCase();
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>)["X-CSRF-Token"] = csrfToken;
  }
  return cfg;
});

// ---- Shared response/data types (mirror the backend envelope) ----

export interface Envelope<T> {
  success: boolean;
  data: T;
  message: string;
  correlationId: string;
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
  correlationId: string;
}

export interface Certificate {
  certificateId: string;
  studentName: string;
  studentIdentifier: string;
  institutionName: string;
  qualification: string;
  graduationYear: number;
  issueDate: string;
  documentHash: string;
  signature: string;
  signatureAlgorithm: string;
  canonicalFormatVersion: string;
  issuerId: number;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface Issuer {
  id: number;
  issuerName: string;
  issuerCode: string;
  publicKey: string;
  keyAlgorithm: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type OverallResult =
  | "VERIFIED"
  | "DOCUMENT_MISMATCH"
  | "INVALID_SIGNATURE"
  | "REVOKED"
  | "NOT_REGISTERED"
  | "INCONCLUSIVE";

export interface VerificationResult {
  certificateId: string;
  issuer: { issuerName: string; issuerCode: string } | null;
  checks: {
    record: "FOUND" | "NOT_FOUND";
    integrity: "MATCH" | "MISMATCH" | "NOT_CHECKED";
    signature: "VALID" | "INVALID" | "NOT_CHECKED";
    revocation: "ACTIVE" | "REVOKED" | "UNKNOWN";
  };
  overall: OverallResult;
  explanation: string;
  details: {
    submittedHash: string | null;
    registeredHash: string | null;
    revokedAt?: string | null;
    revocationReason?: string | null;
  };
}

export interface HashLabResult {
  algorithm: string;
  fileName: string;
  fileSizeBytes: number;
  hash: string;
  note: string;
}

export interface SignatureDemoResult {
  algorithm: string;
  issuerCode: string;
  canonical: string;
  signature: string;
  publicKey: string;
  originalVerified: boolean;
  tampered: { canonical: string; verified: boolean; explanation: string } | null;
  note: string;
}

/** Extract a safe, human-readable message from an API error. */
export function apiErrorMessage(err: unknown): string {
  const axiosErr = err as AxiosError<ErrorEnvelope>;
  if (axiosErr?.response?.data?.error?.message) {
    return axiosErr.response.data.error.message;
  }
  if (axiosErr?.message) return axiosErr.message;
  return "An unexpected error occurred.";
}

// ---- API calls ----

export async function fetchHealth() {
  const res = await api.get<Envelope<{ status: string; schemaVersion: number; phase: number }>>("/health");
  return res.data.data;
}

export async function fetchCertificates(params: { search?: string; status?: string }) {
  const res = await api.get<Envelope<{ certificates: Certificate[]; total: number }>>(
    "/certificates",
    { params }
  );
  return res.data.data;
}

export async function fetchCertificate(certificateId: string) {
  const res = await api.get<Envelope<{ certificate: Certificate; issuer: Issuer | null }>>(
    `/certificates/${encodeURIComponent(certificateId)}`
  );
  return res.data.data;
}

export async function registerCertificate(form: FormData) {
  const res = await api.post<Envelope<{ certificate: Certificate }>>("/certificates", form);
  return res.data.data;
}

export async function revokeCertificate(certificateId: string, reason: string) {
  const res = await api.post<Envelope<{ certificate: Certificate }>>(
    `/certificates/${encodeURIComponent(certificateId)}/revoke`,
    { reason }
  );
  return res.data.data;
}

export async function verifyCertificate(form: FormData) {
  const res = await api.post<Envelope<VerificationResult>>("/verify", form);
  return res.data.data;
}

export async function hashLab(form: FormData) {
  const res = await api.post<Envelope<HashLabResult>>("/lab/hash", form);
  return res.data.data;
}

export async function signatureDemo(payload: unknown) {
  const res = await api.post<Envelope<SignatureDemoResult>>("/lab/signature-demo", payload);
  return res.data.data;
}

export async function fetchIssuers() {
  const res = await api.get<Envelope<{ issuers: Issuer[]; total: number }>>("/issuers");
  return res.data.data;
}

// ---- Phase 2: Privacy API ----

export interface AesPayload {
  alg: "AES-256-GCM";
  v: number;
  nonce: string;
  tag: string;
  ciphertext: string;
  encoding: "base64";
}

export async function privacyEncrypt(plaintext: string) {
  const res = await api.post<Envelope<{ payload: AesPayload; display: { nonce: string; tag: string }; note: string }>>(
    "/privacy/encrypt",
    { plaintext }
  );
  return res.data.data;
}

export async function privacyDecrypt(payload: AesPayload) {
  const res = await api.post<Envelope<{ plaintext: string; authenticated: boolean }>>(
    "/privacy/decrypt",
    { payload }
  );
  return res.data.data;
}

export interface PiiMatch {
  category: string;
  value: string;
  start: number;
  end: number;
  confidence: "high" | "medium" | "low";
  method: string;
}
export interface PiiResult {
  matches: PiiMatch[];
  countsByCategory: Record<string, number>;
  supportedCategories: string[];
  limitations: string;
}
export async function privacyDetectPii(text: string) {
  const res = await api.post<Envelope<PiiResult>>("/privacy/pii/detect", { text });
  return res.data.data;
}

export interface MaskFieldInput {
  field: string;
  value: string;
  strategy: "email" | "phone" | "id" | "name" | "full" | "partial";
  visible?: number;
}
export interface MaskFieldResult {
  field: string;
  original: string;
  masked: string;
  strategy: string;
  visibleChars: number;
}
export async function privacyMask(fields: MaskFieldInput[]) {
  const res = await api.post<Envelope<{ results: MaskFieldResult[]; note: string }>>(
    "/privacy/masking/demo",
    { fields }
  );
  return res.data.data;
}

export interface PseudonymResult {
  pseudonym: string;
  scope: string;
  keyVersion: number;
  method: string;
  plainHashDemo?: { value: string; warning: string };
  note: string;
}
export async function privacyPseudonymize(payload: {
  identifier: string;
  scope?: string;
  keyVersion?: number;
  includePlainHashDemo?: boolean;
}) {
  const res = await api.post<Envelope<PseudonymResult>>("/privacy/pseudonymize", payload);
  return res.data.data;
}

export interface MinimizationResult {
  operation: string;
  fullFieldCount: number;
  responseFieldCount: number;
  includedFields: string[];
  excludedFields: string[];
  exclusionReasons: Record<string, string>;
  response: Record<string, unknown>;
  note: string;
}
export async function privacyMinimizationSample() {
  const res = await api.get<Envelope<{ record: Record<string, unknown> }>>(
    "/privacy/minimization/sample"
  );
  return res.data.data;
}
export async function privacyMinimize(operation: string, record?: Record<string, unknown>) {
  const res = await api.post<Envelope<MinimizationResult>>("/privacy/minimization/demo", {
    operation,
    record,
  });
  return res.data.data;
}

export interface VcSplitResult {
  secretWidth: number;
  secretHeight: number;
  shareWidth: number;
  shareHeight: number;
  share1Base64: string;
  share2Base64: string;
  note: string;
}
export async function privacyVcSplit(text: string, image?: File) {
  const fd = new FormData();
  if (image) fd.append("image", image);
  else fd.append("text", text);
  const res = await api.post<Envelope<VcSplitResult>>(
    "/privacy/visual-cryptography/split",
    fd
  );
  return res.data.data;
}
export async function privacyVcReconstruct(share1: Blob, share2: Blob) {
  const fd = new FormData();
  fd.append("share1", share1, "share1.png");
  fd.append("share2", share2, "share2.png");
  const res = await api.post<Envelope<{ reconstructedBase64: string; note: string }>>(
    "/privacy/visual-cryptography/reconstruct",
    fd
  );
  return res.data.data;
}

export interface StegoSample {
  carrierBase64: string;
  capacityBytes: number;
  width: number;
  height: number;
}
export async function privacyStegoSample() {
  const res = await api.get<Envelope<StegoSample>>("/privacy/steganography/sample-carrier");
  return res.data.data;
}
export interface StegoEmbedResult {
  pngBase64: string;
  capacityBytes: number;
  messageBytes: number;
  width: number;
  height: number;
  note: string;
}
export async function privacyStegoEmbed(message: string, image: Blob) {
  const fd = new FormData();
  fd.append("message", message);
  fd.append("image", image, "carrier.png");
  const res = await api.post<Envelope<StegoEmbedResult>>(
    "/privacy/steganography/embed",
    fd
  );
  return res.data.data;
}
export async function privacyStegoExtract(image: Blob) {
  const fd = new FormData();
  fd.append("image", image, "stego.png");
  const res = await api.post<Envelope<{ message: string; messageBytes: number }>>(
    "/privacy/steganography/extract",
    fd
  );
  return res.data.data;
}

// ---- Identity & Access ----

export interface MeUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  roleId: number;
  organizationId: number | null;
  organizationName: string | null;
  studentIdentifier: string | null;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  permissions?: string[];
}

export async function login(email: string, password: string) {
  const res = await api.post<Envelope<{ mfaRequired: boolean; csrfToken: string; user?: MeUser }>>("/auth/login", { email, password });
  return res.data.data;
}
export async function mfaVerify(payload: { token?: string; recoveryCode?: string }) {
  const res = await api.post<Envelope<{ csrfToken: string; user: MeUser }>>("/auth/mfa/verify", payload);
  return res.data.data;
}
export async function logout() {
  await api.post("/auth/logout", {});
}
export async function fetchMe() {
  const res = await api.get<Envelope<{ user?: MeUser; permissions?: string[]; csrfToken?: string; mfaPending?: boolean }>>("/auth/me");
  return res.data.data;
}
export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post<Envelope<{ csrfToken: string }>>("/auth/password/change", { currentPassword, newPassword });
  return res.data.data;
}
export async function forgotPassword(email: string) {
  const res = await api.post<Envelope<{ resetTokenDev?: string }>>("/auth/password/forgot", { email });
  return res.data.data;
}
export async function resetPassword(token: string, newPassword: string) {
  const res = await api.post<Envelope<Record<string, never>>>("/auth/password/reset", { token, newPassword });
  return res.data.data;
}
export async function mfaEnroll() {
  const res = await api.post<Envelope<{ qrDataUrl: string; otpauthUrl: string; recoveryCodes: string[] }>>("/auth/mfa/enroll", {});
  return res.data.data;
}
export async function mfaConfirm(token: string) {
  const res = await api.post<Envelope<{ mfaEnabled: boolean }>>("/auth/mfa/confirm", { token });
  return res.data.data;
}
export async function mfaDisable(password: string, token: string) {
  const res = await api.post<Envelope<{ mfaEnabled: boolean }>>("/auth/mfa/disable", { password, token });
  return res.data.data;
}
export async function fetchSessions() {
  const res = await api.get<Envelope<{ sessions: unknown[]; recoveryCodesRemaining: number }>>("/auth/sessions");
  return res.data.data;
}

export interface AdminUser extends MeUser {}
export async function fetchUsers(params: { search?: string; role?: string; status?: string } = {}) {
  const res = await api.get<Envelope<{ users: AdminUser[] }>>("/users", { params });
  return res.data.data;
}
export async function createUserApi(payload: Record<string, unknown>) {
  const res = await api.post<Envelope<{ user: AdminUser }>>("/users", payload);
  return res.data.data;
}
export async function deactivateUser(id: number) {
  const res = await api.post<Envelope<{ user: AdminUser }>>(`/users/${id}/deactivate`, {});
  return res.data.data;
}
export async function activateUser(id: number) {
  const res = await api.post<Envelope<{ user: AdminUser }>>(`/users/${id}/activate`, {});
  return res.data.data;
}
export async function assignUserRole(id: number, role: string) {
  const res = await api.post<Envelope<{ user: AdminUser }>>(`/users/${id}/role`, { role });
  return res.data.data;
}
export async function resetUserMfa(id: number) {
  await api.post(`/users/${id}/mfa/reset`, {});
}

// ---- Dashboard ----
export async function fetchDashboard() {
  const res = await api.get<Envelope<Record<string, unknown>>>("/dashboard");
  return res.data.data;
}

// ---- Security Operations ----
export async function fetchSecuritySummary() {
  const res = await api.get<Envelope<{ summary: Record<string, unknown>; highRisk: unknown[] }>>("/security/summary");
  return res.data.data;
}
export async function fetchSecurityEvents(params: Record<string, unknown> = {}) {
  const res = await api.get<Envelope<{ events: Record<string, unknown>[]; total: number }>>("/security/events", { params });
  return res.data.data;
}
export async function fetchRules() {
  const res = await api.get<Envelope<{ rules: Record<string, unknown>[] }>>("/security/rules");
  return res.data.data;
}
export async function fetchRisk() {
  const res = await api.get<Envelope<{ highRisk: Record<string, unknown>[] }>>("/security/risk");
  return res.data.data;
}
export async function fetchSimulations() {
  const res = await api.get<Envelope<{ scenarios: Record<string, unknown>[] }>>("/security/simulations");
  return res.data.data;
}
export async function runSimulationApi(scenario: string) {
  const res = await api.post<Envelope<{ result: Record<string, unknown> }>>(`/security/simulations/${scenario}/run`, {});
  return res.data.data;
}

// ---- Incidents ----
export async function fetchIncidents(params: Record<string, unknown> = {}) {
  const res = await api.get<Envelope<{ incidents: Record<string, unknown>[]; total: number }>>("/incidents", { params });
  return res.data.data;
}
export async function createIncidentApi(payload: Record<string, unknown>) {
  const res = await api.post<Envelope<{ incident: Record<string, unknown> }>>("/incidents", payload);
  return res.data.data;
}
export async function fetchIncident(id: number) {
  const res = await api.get<Envelope<{ incident: Record<string, unknown>; actions: Record<string, unknown>[] }>>(`/incidents/${id}`);
  return res.data.data;
}
export async function incidentAction(id: number, payload: Record<string, unknown>) {
  const res = await api.post<Envelope<{ result: Record<string, unknown> }>>(`/incidents/${id}/actions`, payload);
  return res.data.data;
}
export async function resolveIncident(id: number, notes?: string) {
  const res = await api.post<Envelope<{ incident: Record<string, unknown> }>>(`/incidents/${id}/resolve`, { notes });
  return res.data.data;
}
export async function reverseIncidentAction(actionId: number) {
  await api.post(`/incidents/actions/${actionId}/reverse`, {});
}

// ---- Audit ----
export async function fetchAudit(params: Record<string, unknown> = {}) {
  const res = await api.get<Envelope<{ events: Record<string, unknown>[]; total: number }>>("/audit", { params });
  return res.data.data;
}
export async function fetchAuditIntegrity() {
  const res = await api.get<Envelope<{ integrity: { ok: boolean; checked: number; message: string; firstBrokenId: number | null } }>>("/audit/integrity");
  return res.data.data;
}
export function auditExportUrl() {
  return "/api/audit/export";
}
