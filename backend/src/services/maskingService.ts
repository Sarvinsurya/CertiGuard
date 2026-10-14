/**
 * Data masking.
 *
 * Reduces exposure of sensitive values for display or in selected API
 * responses. Masking is NOT encryption and is NOT reversible — it simply
 * replaces characters. Masking functions never mutate their input.
 *
 * Because RBAC arrives in Phase 3, masking here is a presentation-boundary
 * demonstration, not a complete authorization system.
 */

export type MaskStrategy = "email" | "phone" | "id" | "name" | "full" | "partial";

const MASK = "*";

/** Keep the last `visible` characters; mask the rest. */
export function maskPartial(value: string, visible = 4): string {
  if (!value) return value;
  if (value.length <= visible) return MASK.repeat(value.length);
  return MASK.repeat(value.length - visible) + value.slice(value.length - visible);
}

/** Fully mask every character. */
export function maskFull(value: string): string {
  return value ? MASK.repeat(value.length) : value;
}

/** s******t@example.com — keep first & last of local part, keep domain. */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return maskFull(value);
  const local = value.slice(0, at);
  const domain = value.slice(at);
  if (local.length <= 2) return MASK.repeat(local.length) + domain;
  return local[0] + MASK.repeat(local.length - 2) + local[local.length - 1] + domain;
}

/** ******3210 — keep last 4 digits. */
export function maskPhone(value: string): string {
  return maskPartial(value, 4);
}

/** ********2345 — keep last 4 characters. */
export function maskId(value: string): string {
  return maskPartial(value, 4);
}

/** John Doe -> J*** D** (keep each word's first letter). */
export function maskName(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? part : part[0] + MASK.repeat(part.length - 1)))
    .join(" ");
}

export function applyMask(value: string, strategy: MaskStrategy, visible = 4): string {
  switch (strategy) {
    case "email":
      return maskEmail(value);
    case "phone":
      return maskPhone(value);
    case "id":
      return maskId(value);
    case "name":
      return maskName(value);
    case "full":
      return maskFull(value);
    case "partial":
      return maskPartial(value, visible);
    default:
      return maskFull(value);
  }
}

export interface MaskFieldInput {
  field: string;
  value: string;
  strategy: MaskStrategy;
  visible?: number;
}

export interface MaskFieldResult {
  field: string;
  original: string;
  masked: string;
  strategy: MaskStrategy;
  visibleChars: number;
}

export function maskFields(inputs: MaskFieldInput[]): MaskFieldResult[] {
  return inputs.map((i) => ({
    field: i.field,
    original: i.value, // input is NOT mutated; echoed for demonstration only
    masked: applyMask(i.value, i.strategy, i.visible ?? 4),
    strategy: i.strategy,
    visibleChars:
      i.strategy === "full"
        ? 0
        : i.strategy === "email"
          ? 2
          : i.strategy === "name"
            ? -1
            : (i.visible ?? 4),
  }));
}
