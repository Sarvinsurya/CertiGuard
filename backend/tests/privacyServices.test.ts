import { describe, it, expect } from "vitest";
import { detectPii } from "../src/services/piiService.js";
import {
  maskEmail,
  maskPhone,
  maskId,
  maskName,
  maskFull,
  applyMask,
  maskFields,
} from "../src/services/maskingService.js";
import {
  minimize,
  sampleFullRecord,
  serializeVerification,
  serializePublicStatus,
} from "../src/services/minimizationService.js";

describe("PII detection", () => {
  it("detects email, phone, student id, and DOB", () => {
    const text =
      "Contact aarav.sharma@example.edu or 9876543210. ID CGDU-STU-2024-0001. DOB 14/03/2002.";
    const r = detectPii(text);
    const cats = new Set(r.matches.map((m) => m.category));
    expect(cats.has("EMAIL")).toBe(true);
    expect(cats.has("PHONE")).toBe(true);
    expect(cats.has("STUDENT_ID")).toBe(true);
    expect(cats.has("DOB")).toBe(true);
    expect(r.countsByCategory.EMAIL).toBe(1);
  });

  it("reports locations (start/end) for matches", () => {
    const r = detectPii("mail me at test@example.com please");
    const email = r.matches.find((m) => m.category === "EMAIL")!;
    expect("test@example.com").toBe("mail me at test@example.com please".slice(email.start, email.end));
  });

  it("does not detect PII in neutral text", () => {
    const r = detectPii("the quick brown fox jumps over the lazy dog");
    expect(r.matches.filter((m) => m.confidence !== "low").length).toBe(0);
  });

  it("handles empty-ish input and length limits", () => {
    expect(detectPii("   ").matches.length).toBe(0);
    expect(() => detectPii("x".repeat(20001))).toThrow();
  });
});

describe("Data masking", () => {
  it("masks email keeping first/last of local part", () => {
    expect(maskEmail("student@example.com")).toBe("s*****t@example.com");
  });
  it("masks phone keeping last 4", () => {
    expect(maskPhone("9876543210")).toBe("******3210");
  });
  it("masks id keeping last 4", () => {
    expect(maskId("STU202612345")).toBe("********2345");
  });
  it("masks name keeping initials", () => {
    expect(maskName("John Doe")).toBe("J*** D**");
  });
  it("full mask hides everything", () => {
    expect(maskFull("secret")).toBe("******");
  });
  it("does not mutate the original input", () => {
    const inputs = [{ field: "email", value: "a@b.com", strategy: "email" as const }];
    const original = inputs[0].value;
    maskFields(inputs);
    expect(inputs[0].value).toBe(original);
  });
  it("short values are fully masked, never over-exposed", () => {
    expect(applyMask("ab", "partial", 4)).toBe("**");
    expect(maskId("12").includes("12")).toBe(false);
  });
});

describe("Data minimization", () => {
  it("verification serializer excludes personal contact / internal id / DOB", () => {
    const out = serializeVerification(sampleFullRecord());
    expect(out).toHaveProperty("certificateId");
    expect(out).toHaveProperty("qualification");
    expect(out).not.toHaveProperty("studentEmail");
    expect(out).not.toHaveProperty("studentIdentifier");
    expect(out).not.toHaveProperty("dateOfBirth");
    expect(out).not.toHaveProperty("address");
  });

  it("public status serializer excludes the student name", () => {
    const out = serializePublicStatus(sampleFullRecord());
    expect(out).not.toHaveProperty("studentName");
    expect(out).toHaveProperty("status");
  });

  it("minimize() reports included/excluded fields and reasons", () => {
    const cmp = minimize(sampleFullRecord(), "verification");
    expect(cmp.responseFieldCount).toBeLessThan(cmp.fullFieldCount);
    expect(cmp.excludedFields).toContain("studentEmail");
    expect(cmp.exclusionReasons.studentEmail).toBeTruthy();
  });

  it("fullAdmin returns all fields", () => {
    const cmp = minimize(sampleFullRecord(), "fullAdmin");
    expect(cmp.responseFieldCount).toBe(cmp.fullFieldCount);
  });
});
