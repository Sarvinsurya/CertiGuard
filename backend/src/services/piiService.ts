/**
 * PII detection (pattern-based).
 *
 * Detects common categories of personally identifiable information in free
 * text using configurable regular expressions and light contextual checks.
 *
 * LIMITATIONS (documented honestly):
 *   - Pattern matching cannot detect every possible PII value and will produce
 *     false positives and false negatives.
 *   - Names and addresses are detected heuristically with LOW confidence.
 *   - This runs entirely locally; input is never sent to any external service.
 */

export type PiiCategory =
  | "EMAIL"
  | "PHONE"
  | "STUDENT_ID"
  | "AADHAAR"
  | "PAN"
  | "DOB"
  | "NAME"
  | "ADDRESS";

export type Confidence = "high" | "medium" | "low";

export interface PiiMatch {
  category: PiiCategory;
  value: string;
  start: number;
  end: number;
  confidence: Confidence;
  method: string;
}

interface Detector {
  category: PiiCategory;
  regex: RegExp;
  confidence: Confidence;
  method: string;
  validate?: (value: string) => boolean;
}

// Aadhaar: 12 digits (often spaced in 4-4-4). PAN: 5 letters, 4 digits, 1 letter.
const detectors: Detector[] = [
  {
    category: "EMAIL",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    confidence: "high",
    method: "regex:email",
  },
  {
    category: "PAN",
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
    confidence: "high",
    method: "regex:pan",
  },
  {
    category: "AADHAAR",
    regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
    confidence: "medium",
    method: "regex:aadhaar(12-digit)",
  },
  {
    category: "STUDENT_ID",
    regex: /\b(?:STU|CGDU-STU|REG|ROLL)[-_]?[A-Z0-9-]{3,}\b/gi,
    confidence: "high",
    method: "regex:student-id-prefix",
  },
  {
    category: "PHONE",
    // E.164-ish or Indian 10-digit starting 6-9; avoid matching 12-digit Aadhaar.
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?(?<!\d)[6-9]\d{9}(?!\d)\b/g,
    confidence: "medium",
    method: "regex:phone",
  },
  {
    category: "DOB",
    regex:
      /\b(?:(?:0?[1-9]|[12]\d|3[01])[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:19|20)\d{2}|(?:19|20)\d{2}[\/\-.](?:0?[1-9]|1[0-2])[\/\-.](?:0?[1-9]|[12]\d|3[01]))\b/g,
    confidence: "medium",
    method: "regex:date",
  },
  {
    category: "NAME",
    // Heuristic: two or more capitalized words. LOW confidence by design.
    regex: /\b(?:[A-Z][a-z]+)(?:\s[A-Z][a-z]+){1,2}\b/g,
    confidence: "low",
    method: "heuristic:capitalized-words",
  },
  {
    category: "ADDRESS",
    // Heuristic: number + street-type keyword. LOW confidence.
    regex:
      /\b\d{1,5}\s+[A-Za-z0-9.\s,]{3,40}\b(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Nagar|Colony|Block)\b/gi,
    confidence: "low",
    method: "heuristic:street-keyword",
  },
];

export interface PiiDetectionResult {
  matches: PiiMatch[];
  countsByCategory: Record<string, number>;
  supportedCategories: PiiCategory[];
  limitations: string;
}

const MAX_TEXT_LENGTH = 20000;

export function detectPii(text: string): PiiDetectionResult {
  if (typeof text !== "string") {
    throw new Error("Text input is required.");
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text exceeds the maximum length of ${MAX_TEXT_LENGTH} characters.`);
  }

  const matches: PiiMatch[] = [];
  const claimed: Array<[number, number]> = []; // ranges claimed by higher-priority detectors

  for (const d of detectors) {
    d.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = d.regex.exec(text)) !== null) {
      const value = m[0];
      const start = m.index;
      const end = start + value.length;
      if (d.validate && !d.validate(value)) continue;
      // Skip low/medium matches that overlap an already-claimed (higher-priority) range.
      const overlaps = claimed.some(([s, e]) => start < e && end > s);
      if (overlaps && (d.confidence === "low" || d.category === "PHONE")) continue;
      matches.push({
        category: d.category,
        value,
        start,
        end,
        confidence: d.confidence,
        method: d.method,
      });
      if (d.confidence === "high" || d.confidence === "medium") claimed.push([start, end]);
      if (m.index === d.regex.lastIndex) d.regex.lastIndex++; // avoid zero-width loops
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const countsByCategory: Record<string, number> = {};
  for (const match of matches) {
    countsByCategory[match.category] = (countsByCategory[match.category] ?? 0) + 1;
  }

  return {
    matches,
    countsByCategory,
    supportedCategories: detectors.map((d) => d.category),
    limitations:
      "Pattern-based detection. Names/addresses are low-confidence heuristics; expect false positives and negatives. Not a substitute for a trained NER model. Input is processed locally and never sent to external services.",
  };
}
