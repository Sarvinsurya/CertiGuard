# CertiGuard — Demonstration & Showcase Guide

This guide is a complete, step-by-step script for presenting CertiGuard to reviewers. It
tells you exactly what to click, which account to use, what you should see, and — importantly —
**what is happening behind the scenes** at each step so you can explain the mechanism
confidently.

> Read the long sections during preparation. The **Quick Reference** and **One-line summaries**
> at the very end are what you keep open during the live demo.

---

## 0. Before the demo — one-time setup

Do this once on the machine you will present from.

### 0.1 Start the backend
```bash
cd backend
npm install                 # first time only
cp .env.example .env        # first time only
npm run migrate             # create/upgrade the SQLite schema
npm run init:keys           # generate the 4 cryptographic keys (once)
```

### 0.2 Create the administrator account
The admin is **never** created by public sign-up. You provision it once from environment
variables:
```bash
CERTIGUARD_ADMIN_EMAIL=admin@demo.certiguard \
CERTIGUARD_ADMIN_PASSWORD='AdminDemo123!' \
npm run bootstrap:admin
```
**Why it works this way:** the bootstrap only creates an admin if **no admin already exists**,
so it cannot silently create a second one. The password is never printed or hardcoded.

### 0.3 Load demo data (synthetic users + sample certificates)
```bash
npm run seed
```
This registers three **real** sample certificates (actual hashing + signing — not fake rows)
and creates three demo users.

### 0.4 Start both apps
```bash
# terminal 1
cd backend && npm run dev        # API on http://localhost:4000
# terminal 2
cd frontend && npm run dev       # UI on http://localhost:5173
```
Open **http://localhost:5173**.

### 0.5 Accounts you will use

| Role | Email | Password | What they can do |
|---|---|---|---|
| **Security Administrator** | `admin@demo.certiguard` | `AdminDemo123!` | Users, security ops, audit, incidents, simulations |
| **Institution Issuer** | `issuer@demo.certiguard` | `DemoPass123!` | Register / revoke certificates, privacy labs |
| **Company Verifier** | `verifier@demo.certiguard` | `DemoPass123!` | Verify certificates, privacy labs |
| **Student** | `student@demo.certiguard` | `DemoPass123!` | View only their own certificates |

> The demo password default is `DemoPass123!` (override with `CERTIGUARD_DEMO_PASSWORD`).
> The admin password is whatever you set in step 0.2.

### 0.6 Sample certificates created by the seed

| Certificate ID | Student | Status | Use it to show |
|---|---|---|---|
| `SAMPLE-CGDU-2024-0001` | Aarav Sharma | active | Normal verification / registry |
| `SAMPLE-CGDU-2023-0042` | Priya Nair | active | Registry, details |
| `SAMPLE-CGDU-2022-0107` | Rahul Verma | **revoked** | The "revoked but still authentic" story |

> The student account `student@demo.certiguard` is linked to identifier
> `CGDU-STU-2024-0001`, i.e. **Aarav Sharma's** certificate — so the student can see
> `SAMPLE-CGDU-2024-0001` and nothing else.

### 0.7 Reset between runs (optional)
To start totally fresh: stop the backend, delete `backend/database/certiguard.db`
(and `-wal`/`-shm`), then repeat 0.2–0.4. **Do not delete `backend/keys/`** unless you want
new keys (old signatures would then need the old public key to verify).

---

## 1. Logging in (and what happens behind the scenes)

**What to do:** open http://localhost:5173 → you are redirected to the **Login** page →
enter an email + password → **Sign in**.

**What you should see:** the dashboard for that role loads. The sidebar only shows the
sections that role is allowed to use.

**How it works (explain this):**
1. The browser sends `POST /api/auth/login`. The server looks up the user and verifies the
   password using **scrypt** (a slow, memory-hard hash). Passwords are never stored in
   plaintext and are compared in constant time.
2. If correct and MFA is **not** enabled, the server creates a **session**: it generates a
   random token, stores only its **SHA-256 hash** in the database, and sends the raw token to
   the browser as an **HttpOnly cookie** (JavaScript cannot read it, which blocks XSS theft).
3. The response also returns a **CSRF token**. The frontend sends it back in an
   `X-CSRF-Token` header on every state-changing request; the server checks it matches the
   session — this blocks cross-site request forgery.
4. Failed logins return a **generic** "Invalid email or password" (so an attacker can't tell
   whether an email exists), increment a failure counter, and after 5 failures the account is
   **temporarily locked**. Each failure is recorded as a security event.

**Talking point:** "Authorization is enforced on the server. The sidebar hides links you
can't use, but even if you typed the URL directly, the backend would reject it with 403."

---

## 2. The main workflow — issue → verify → revoke → re-verify

This is the heart of the product and the single most important demo. Have a PDF ready
(any PDF; or use the sample flow below).

### 2.1 Register a certificate (as the Issuer)

**Account:** `issuer@demo.certiguard`.
**What to do:** sidebar → **Certificate Management → Register Certificate**. Fill the form
(Certificate ID e.g. `DEMO-2024-9001`, student name, student identifier, institution,
qualification, year, issue date), drag a PDF into the drop zone, click **Register**.

**What you should see:** a success message with the certificate's SHA-256 hash, and a link to
open its details.

**How it works (explain this):**
1. The backend validates every field (zod) and checks the file is really a PDF by its first
   bytes (`%PDF-`), not just its name, and within the size limit.
2. It computes the **SHA-256 hash** of the exact uploaded bytes — this is the document's
   fingerprint.
3. It builds a **canonical metadata record** (a deterministic, fixed-order text form of the
   fields + the document hash + the issuer code) and signs it with the institution's
   **Ed25519 private key**. The private key never leaves the server and never appears in any
   response.
4. It stores the PDF under a random filename (not web-accessible), writes the DB row inside a
   transaction, and records an **audit log** entry.

**Talking point:** "Two independent protections are created here: the **hash** protects the
PDF bytes; the **signature** protects the metadata and binds it to that hash."

### 2.2 Verify the genuine certificate (as the Verifier)

**Account:** sign out, sign in as `verifier@demo.certiguard`.
**What to do:** sidebar → **Verify Certificate** → enter the certificate ID → upload the
**same** PDF → **Verify**.

**What you should see:** four independent checks all green and overall **VERIFIED**:
- Certificate record: **FOUND**
- Document integrity: **MATCH**
- Digital signature: **VALID**
- Revocation status: **ACTIVE**

**How it works:** the backend re-hashes the uploaded bytes and compares to the stored hash;
rebuilds the canonical record from the stored row and verifies the signature with the issuer's
**public key**; and checks the status. Only when **all four** pass is the result VERIFIED.
Every verification is also recorded as a security event (this is what feeds the verifier
dashboard and anomaly detection).

### 2.3 Show tamper detection (controlled failure)

**What to do:** upload a **different** PDF (or an edited copy) against the same certificate ID.

**What you should see:** Document integrity: **MISMATCH**, overall **DOCUMENT_MISMATCH**.

**Talking point (important nuance):** "A mismatch means the bytes differ from the registered
file — it is **not** automatically proof of fraud. It could be a re-export. The system states
this honestly."

### 2.4 Revoke the certificate (as the Issuer)

**Account:** sign back in as `issuer@demo.certiguard`.
**What to do:** **Certificate Registry** → find the certificate → **Revoke** → enter a reason.
(Or open the certificate's **Details** page and revoke there.)

**What you should see:** status becomes **Revoked** with a timestamp and reason.

**How it works:** revocation sets the status in SQLite, stores `revoked_at` and the reason,
and writes an audit entry. It persists across restarts and cannot be silently reactivated.
**Only the Issuer role has the `certificate.revoke` permission** — try it as the verifier and
you get 403 (good RBAC talking point).

### 2.5 Re-verify the revoked certificate (the key insight)

**Account:** verifier again.
**What to do:** verify the **same original PDF** that passed in 2.2.

**What you should see:** Document integrity **MATCH**, Signature **VALID**, Revocation
**REVOKED**, overall **REVOKED** (not VERIFIED).

**Talking point:** "This proves that **integrity and current validity are different checks**.
The document is still authentic and unaltered, but the issuer has withdrawn it, so the overall
result is correctly REVOKED." (You can use the pre-seeded `SAMPLE-CGDU-2022-0107` to show a
revoked record instantly without doing the revoke live.)

### 2.6 Unregistered certificate
Verify any made-up ID → **NOT_REGISTERED**. Shows the system won't invent a result.

---

## 3. The crypto labs (SHA-256 and signatures, shown in isolation)

These let you explain the cryptography without touching real records.

### 3.1 SHA-256 Hashing Lab
**Account:** issuer or verifier. **Where:** sidebar → **Cryptography Labs → SHA-256 Hashing**.
Upload a PDF in slot A and a slightly different copy in slot B → **Compute** each.
**What you see:** two different 64-character digests; the lab tells you they differ.
**Explain:** every digest is computed by the backend from the actual bytes; changing a single
byte changes about half the output bits. A hash proves integrity, **not** authorship.

### 3.2 Digital Signature Lab
**Where:** sidebar → **Cryptography Labs → Digital Signatures**.
Click **Sign & verify (normal)** → signature VALID. Then pick a field to tamper and run **Sign
original, verify against tampered** → signature **INVALID**.
**Explain:** real Ed25519 signing on the backend, isolated from live certificates. A valid
signature proves integrity + possession of the signing key; trust also depends on trusting the
issuer's public key.

---

## 4. Privacy & Information Protection labs

**Account:** issuer or verifier (both have `privacy.use`). Sidebar → **Privacy & Information
Protection**. Each lab has a built-in explanation, a normal demo, and a failure demo. Present
them in this order:

### 4.1 Encryption Lab (AES-256-GCM)
Type text → **Encrypt** → you see ciphertext + masked nonce + masked tag → **Decrypt** returns
the text. Then click **Tamper ciphertext** (or **Tamper tag**) → **Decrypt** → it **fails**
with an authentication error.
**Explain:** AES-256-GCM is reversible **authenticated** encryption. A fresh 96-bit nonce is
used per operation; the 128-bit tag detects any change. Decryption **fails closed** — no
plaintext is returned if authentication fails. The key stays on the server. (Contrast with
SHA-256, which is one-way.)

### 4.2 PII Detection
Use the sample text → **Detect PII** → a table of detections with category, exact location,
confidence, and method, plus counts per category.
**Explain:** configurable regex + light context rules, running **locally** (nothing sent to
any external service). Names/addresses are low-confidence heuristics; pattern matching has
false positives/negatives — stated honestly.

### 4.3 Data Masking
Shows original vs masked for email / phone / ID / name; switch strategies.
**Explain:** masking is irreversible redaction at the presentation boundary. It is **not**
encryption. The original input is never mutated. Who may see unmasked data is governed by RBAC.

### 4.4 Pseudonymization
Enter an identifier → **Generate**. Enter it again → same pseudonym (`PG-XXXXXXXX`). Change the
scope or identifier → different pseudonym. The page also shows the plain-SHA-256 of the input
to explain why keyless hashing is weak.
**Explain:** keyed **HMAC-SHA256** with scope + key-version domain separation; the secret key
stays on the server. Pseudonymization is **not** anonymization — the link can be re-established
with the key.

### 4.5 Data Minimization
Pick an operation (verification / public status / masked / full admin) → see which fields are
**included vs excluded** and why.
**Explain:** separate backend serializers with explicit **allowlists**; raw database rows are
never returned. Less data exposed = less privacy risk.

### 4.6 Visual Cryptography
Enter 1–4 characters (or upload a small image) → **Generate shares** → Share 1 and Share 2 look
like noise → **Reconstruct** reveals the secret. Toggle the "missing-share" option to show one
share alone reveals nothing.
**Explain:** 2-out-of-2 Naor–Shamir scheme done on the backend; each secret pixel becomes a
2×2 block; stacking (OR of black subpixels) reveals it. Limitations: binary images, 2× pixel
expansion, white becomes grey.

### 4.7 Steganography
Type a message → **Embed** into the sample PNG → download/preview the stego image → **Extract**
returns the message. Then **Try extract from the ORIGINAL carrier** → it fails.
**Explain:** PNG least-significant-bit embedding with a length header. Steganography **hides**,
it does not **encrypt** — anyone who knows the method can extract it, so encrypt before
embedding for secrecy. Needs a lossless carrier (PNG); JPEG would destroy the payload.

---

## 5. Identity & Access (as the Administrator)

**Account:** `admin@demo.certiguard`.

### 5.1 User Management
Sidebar → **Identity & Access → User Management**. Show search/filter; create a user; change a
user's role from the dropdown; deactivate/activate; reset a user's MFA.
**Explain:** every action is a permission-checked backend call, audited, and (for role change
or deactivation) it **revokes the user's sessions** so changes take effect immediately. You
cannot deactivate your own account.

### 5.2 Roles & Permissions
Sidebar → **Roles & Permissions** shows the full matrix (which role has which permission).
**Explain:** this is the single source of truth enforced by backend middleware
(`requirePermission`). Deny by default, least privilege.

### 5.3 RBAC live proof (great demo moment)
Sign in as the **verifier**, go to **Verify** (works), then manually type `/register` or
`/users` in the URL. The page may render its shell, but any action calls the backend and
returns **403 Forbidden**. Or simply show that the verifier's sidebar has no "Register" or
"User Management" entries.
**Talking point:** "Hiding navigation is convenience. The real control is the 403 from the
server."

### 5.4 Account Security + MFA (do this on your own account)
Sidebar → **Account Security → Enable MFA** → scan the QR with Google/Microsoft Authenticator →
you are shown **10 one-time recovery codes** → enter a 6-digit code to **confirm**.
Now **sign out and back in**: after the password you are challenged for the **authenticator
code**. Enter a wrong code → rejected; enter the right one → in. You can also sign in with a
**recovery code**, and it can only be used once.
**Explain:** standard TOTP (RFC 6238). The per-user secret is **encrypted at rest** with a
dedicated MFA key and never shown again. Recovery codes are stored only as hashes and are
single-use. Repeated MFA failures are rate-limited and recorded.

---

## 6. Security Operations (as the Administrator)

Sidebar → **Security Operations**.

### 6.1 Security Overview
KPI cards (events, high-risk accounts, open/resolved incidents), events by type and severity,
and high-risk subjects. **Every number is a real database query** over recorded events — if
nothing happened yet, you see honest empty states, not invented data.

### 6.2 Security Simulations (the showpiece)
Sidebar → **Security Simulations** → pick a scenario (e.g. **Login failure burst**) → **Run**.
**What you should see:** a result card with requests attempted / accepted / **HTTP 429** /
events generated, the **detection rules that triggered**, and the resulting **risk
assessment**.
**Explain:** the simulation sends **real HTTP requests** through the live rate limiter and
event pipeline using a synthetic marker. Nothing is faked — the 429s and events are genuine.
It uses conservative counts, synthetic accounts only, and never touches real certificate
records.

### 6.3 Security Events
Sidebar → **Security Events**: searchable, filterable, paginated list. Point out an event's
type, severity, detection rule, and risk contribution. After running a simulation you'll see
the fresh events here.

### 6.4 Risk Monitoring
Sidebar → **Risk Monitoring**: current risk assessments with a score bar and level, plus the
full **detection-rule table** (trigger, threshold, window, severity, weight).
**Explain:** the risk score is a documented **weighted sum** of triggered rules, capped at
100, mapped to low/moderate/high/critical. Each rule contributes at most once so duplicates
can't inflate it. "A heuristic score is a **signal**, not proof of an attack."

### 6.5 Rate limiting (standalone proof, optional)
In a terminal, hammer the login endpoint and watch it return 429 with a `Retry-After` header:
```bash
for i in $(seq 1 20); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x@y.z","password":"bad"}'; done
```
You'll see `200`/`401` turn into `429`. This is the backend enforcing the limit — and each
block is recorded as a security event.

---

## 7. Incident Response (as the Administrator)

Sidebar → **Security Operations → Incidents**.

**What to do:** **+ New incident** (title, description, severity) → open it → in the drawer,
choose a **response action** (start with **Flag for review** or **Suspend account**), pick a
**target user** (use a demo user, not yourself), give a reason, **Apply action**. Then
**Reverse** the action, or **Resolve** the incident.

**Prove it is real:** apply **Suspend** to the student demo user → try to log in as the student
in a private window → **blocked (403)** → come back and **Reverse** the action → the student
can log in again.

**How it works / safety story (explain this):**
- Every action is permission-checked, records who did it, the reason, timestamp, and duration,
  and is written to the **audit log**.
- Actions are **safe and reversible**: temporary throttle, suspend, revoke sessions, require
  password reset, require MFA, flag for review.
- The system **never** auto-deletes users/certificates/files, **never** auto-revokes real
  certificates on a heuristic, and **refuses to auto-suspend an administrator** (try it — you
  get a validation error).

---

## 8. Audit & Compliance (as the Administrator)

Sidebar → **Audit & Compliance**.

### 8.1 Audit Logs
Searchable, filterable, paginated trail of important actions (logins, registrations,
verifications, revocations, user changes, incident actions, …). **Export CSV** downloads it.
**Explain:** this is different from security alerts — it records legitimate actions too. It is
**append-only**; normal users cannot edit or delete entries.

### 8.2 Audit Integrity
Click **Re-verify** → you get "Chain intact" and the number of entries checked.
**Explain:** each entry stores the previous entry's hash and its own hash over a versioned
canonical form (a **hash chain**). Re-verification recomputes the chain independently and would
flag any tampered entry. **Honest limitation:** a hash chain inside one database is
tamper-**evident**, not tamper-**proof** — a privileged database operator could recompute the
whole chain. For stronger guarantees you'd anchor the head hash externally.

---

## 9. Student experience (least privilege)

**Account:** `student@demo.certiguard`.
**What to do:** sidebar is minimal → **My Certificates** shows only Aarav Sharma's certificate
(`SAMPLE-CGDU-2024-0001`). Open its details.
**Prove the boundary:** try to open another student's certificate by typing its ID in the URL
(e.g. `/certificates/SAMPLE-CGDU-2023-0042`) → **403 Forbidden**.
**Explain:** ownership is enforced on the backend (`requireOwnership`) — a student can only
read certificates issued to their own identifier.

---

## 10. Suggested 10–12 minute demo flow (the "golden path")

1. **Login** as issuer — explain scrypt + HttpOnly session + CSRF. (1 min)
2. **Register** a certificate — explain hash + Ed25519 signature. (2 min)
3. Login as **verifier**, **Verify** the same PDF → **VERIFIED** (4 checks). (1 min)
4. Verify a **modified** PDF → **DOCUMENT_MISMATCH** (nuance: not proof of fraud). (1 min)
5. Login as issuer, **Revoke**; verifier re-verifies → **REVOKED** (integrity vs validity). (1.5 min)
6. **Encryption Lab**: encrypt → tamper → decryption fails. (1 min)
7. One more privacy lab of choice (Visual Cryptography is visually striking). (1 min)
8. Login as **admin** → **Run a security simulation** → show real 429s + events + risk. (1.5 min)
9. **Incidents**: suspend the student → student login blocked → reverse → login works. (1.5 min)
10. **Audit Integrity**: re-verify the chain → intact. (0.5 min)
11. Close on the **RBAC** point: verifier/student get 403 on actions they lack. (0.5 min)

---

## 11. Troubleshooting during a demo

- **Can't log in:** confirm the backend is running (`http://localhost:4000/api/health`) and you
  ran `npm run seed` / `bootstrap:admin`. Check the exact email/password from §0.5.
- **Everything returns 401 after a while:** your session hit the idle (30 min) or absolute (8 h)
  limit — just sign in again.
- **A POST returns 403 "Invalid or missing CSRF token":** you were signed out in another tab;
  refresh and sign in again (the frontend re-fetches the CSRF token on load).
- **429 Too Many Requests on login:** that's the rate limiter working; wait for the
  `Retry-After` window or restart the backend to clear the in-memory counters.
- **Fresh start:** delete `backend/database/certiguard.db` and re-run migrate/seed/bootstrap
  (keep `backend/keys/`).

---

## 12. Quick reference card (keep this open)

| Thing | Value |
|---|---|
| UI | http://localhost:5173 |
| API health | http://localhost:4000/api/health |
| Admin | `admin@demo.certiguard` / (your bootstrap password) |
| Issuer | `issuer@demo.certiguard` / `DemoPass123!` |
| Verifier | `verifier@demo.certiguard` / `DemoPass123!` |
| Student | `student@demo.certiguard` / `DemoPass123!` |
| Active sample cert | `SAMPLE-CGDU-2024-0001` |
| Revoked sample cert | `SAMPLE-CGDU-2022-0107` |
| Verify outcomes | VERIFIED · DOCUMENT_MISMATCH · INVALID_SIGNATURE · REVOKED · NOT_REGISTERED · INCONCLUSIVE |

---

## 13. One-line summaries (what each feature proves)

- **Login / sessions:** scrypt-hashed passwords, HttpOnly-cookie sessions, CSRF-protected,
  generic failures, lockout — secure authentication without exposing secrets.
- **Register:** computes the PDF's SHA-256 and Ed25519-signs canonical metadata; private key
  stays server-side.
- **Verify:** four independent server checks (record, hash, signature, revocation) → one honest
  overall result.
- **Document mismatch:** a changed byte changes the hash → MISMATCH (differs from registered,
  not "proven fraud").
- **Revocation:** authentic-but-withdrawn → REVOKED even with a matching hash and valid
  signature (integrity ≠ validity).
- **SHA-256 Lab:** different bytes → different digest; integrity, not authorship.
- **Signature Lab:** valid signature verifies; tampering any signed field breaks it.
- **AES-256-GCM:** reversible authenticated encryption; tampering fails closed (no plaintext).
- **PII Detection:** finds sensitive data locally so it can be protected; honest about accuracy.
- **Data Masking:** redaction for display; not encryption; original untouched.
- **Pseudonymization:** keyed HMAC stable pseudonyms; not anonymization; key stays server-side.
- **Data Minimization:** backend allowlists return only what an operation needs.
- **Visual Cryptography:** 2 shares reveal the secret only when stacked; one share reveals
  nothing.
- **Steganography:** hides a message in PNG LSBs; hiding is not encryption.
- **RBAC:** backend-enforced permissions; wrong role → 403 even by URL.
- **MFA:** real TOTP with encrypted secret + single-use recovery codes.
- **Rate limiting:** real HTTP 429 + Retry-After; feeds the event pipeline.
- **Anomaly detection:** explainable rules (not ML) over real events.
- **Risk scoring:** documented weighted score (0–100) with contributing factors; a signal, not
  proof.
- **Audit log:** append-only, hash-chained, independently verifiable, CSV-exportable;
  tamper-evident (documented limits).
- **Incident response:** authorized, audited, reversible, conservative actions; admins can't be
  auto-suspended; certs never auto-revoked.
- **Security simulation:** drives the real backend and reports measured results, never faked
  numbers.
- **Student view:** least privilege — can see only their own certificate; others → 403.
