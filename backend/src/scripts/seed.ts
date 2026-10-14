import { bootstrap } from "../app.js";
import { makeMinimalPdf } from "../utils/pdf.js";
import {
  registerCertificate,
  getCertificateById,
  revokeCertificate,
} from "../services/certificateService.js";

/**
 * Seeds labelled SAMPLE certificates by running the REAL registration path
 * (actual hashing + signing + persistence). These are clearly sample records
 * for demonstration — not hardcoded database rows.
 */
bootstrap();

interface SampleSpec {
  certificateId: string;
  studentName: string;
  studentIdentifier: string;
  qualification: string;
  graduationYear: number;
  issueDate: string;
  revoke?: string;
}

const samples: SampleSpec[] = [
  {
    certificateId: "SAMPLE-CGDU-2024-0001",
    studentName: "Aarav Sharma",
    studentIdentifier: "CGDU-STU-2024-0001",
    qualification: "B.Tech Computer Science and Engineering",
    graduationYear: 2024,
    issueDate: "2024-06-15",
  },
  {
    certificateId: "SAMPLE-CGDU-2023-0042",
    studentName: "Priya Nair",
    studentIdentifier: "CGDU-STU-2023-0042",
    qualification: "B.Sc Information Security",
    graduationYear: 2023,
    issueDate: "2023-05-20",
  },
  {
    certificateId: "SAMPLE-CGDU-2022-0107",
    studentName: "Rahul Verma",
    studentIdentifier: "CGDU-STU-2022-0107",
    qualification: "M.Tech Cyber Security",
    graduationYear: 2022,
    issueDate: "2022-07-01",
    revoke: "Issued in error — superseded by a corrected certificate (sample).",
  },
];

const institutionName = "CertiGuard Demonstration University";
let created = 0;
let skipped = 0;

for (const s of samples) {
  if (getCertificateById(s.certificateId)) {
    skipped++;
    continue;
  }
  const pdf = makeMinimalPdf(
    `CertiGuard SAMPLE Certificate\n${s.certificateId}\n${s.studentName}\n${s.qualification}`
  );
  registerCertificate({
    certificateId: s.certificateId,
    studentName: s.studentName,
    studentIdentifier: s.studentIdentifier,
    institutionName,
    qualification: s.qualification,
    graduationYear: s.graduationYear,
    issueDate: s.issueDate,
    fileBuffer: pdf,
    originalFilename: `${s.certificateId}.pdf`,
    correlationId: "seed-script",
  });
  if (s.revoke) {
    revokeCertificate({
      certificateId: s.certificateId,
      reason: s.revoke,
      correlationId: "seed-script",
    });
  }
  created++;
}

// -------------------------------------------------------------------------
// Demo users (synthetic). Passwords come from env or safe defaults for the
// local demo ONLY. Never use these in production. All require a password
// change on first login where appropriate.
// -------------------------------------------------------------------------
import { getDb } from "../db/connection.js";
import { hashPassword } from "../services/passwordService.js";
import {
  createUser, findUserByEmail, getRoleIdByName, ensureOrganization,
} from "../services/userService.js";
import { ROLES } from "../auth/rbac.js";
import { getDemoIssuer } from "../services/issuerService.js";

const demoPassword = process.env.CERTIGUARD_DEMO_PASSWORD ?? "DemoPass123!";

const issuerOrg = ensureOrganization(institutionName, "institution");
// Link the institution org to the demo issuer so issuer dashboards resolve.
const issuer = getDemoIssuer();
getDb().prepare("UPDATE organizations SET issuer_id = ? WHERE id = ? AND issuer_id IS NULL").run(issuer.id, issuerOrg);
const verifierOrg = ensureOrganization("Acme Verification Pvt Ltd", "company");

interface DemoUser {
  email: string; name: string; role: string; org?: number | null; studentId?: string | null;
}
const demoUsers: DemoUser[] = [
  { email: "issuer@demo.certiguard", name: "Institution Issuer", role: ROLES.ISSUER, org: issuerOrg },
  { email: "verifier@demo.certiguard", name: "Company Verifier", role: ROLES.VERIFIER, org: verifierOrg },
  { email: "student@demo.certiguard", name: "Aarav Sharma", role: ROLES.STUDENT, org: issuerOrg, studentId: "CGDU-STU-2024-0001" },
];

let usersCreated = 0;
for (const u of demoUsers) {
  if (findUserByEmail(u.email)) continue;
  createUser({
    email: u.email,
    passwordHash: hashPassword(demoPassword),
    displayName: u.name,
    roleId: getRoleIdByName(u.role as never),
    organizationId: u.org ?? null,
    studentIdentifier: u.studentId ?? null,
    mustChangePassword: false, // demo convenience; real provisioning requires a change
  });
  usersCreated++;
}

// eslint-disable-next-line no-console
console.log(
  `[CertiGuard] Seed complete. Created ${created} sample certificate(s), skipped ${skipped} existing; created ${usersCreated} demo user(s).`
);
// eslint-disable-next-line no-console
console.log(
  "[CertiGuard] Demo accounts (local only): issuer@demo.certiguard / verifier@demo.certiguard / student@demo.certiguard. " +
  "Password = CERTIGUARD_DEMO_PASSWORD (default DemoPass123!). Create the admin via `npm run bootstrap:admin`."
);
