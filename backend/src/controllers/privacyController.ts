import type { Request, Response, NextFunction } from "express";
import { encryptData, decryptData, type EncryptedPayload } from "../crypto/aesgcm.js";
import { loadAesKey } from "../crypto/keyManager.js";
import { detectPii } from "../services/piiService.js";
import { maskFields } from "../services/maskingService.js";
import {
  pseudonymize,
  insecurePlainHashDemo,
} from "../services/pseudonymService.js";
import {
  minimize,
  sampleFullRecord,
  type FullCertificateRecord,
  type MinimizationOperation,
} from "../services/minimizationService.js";
import {
  binarize,
  splitShares,
  reconstruct,
  makeSampleSecret,
} from "../services/visualCryptoService.js";
import {
  embedMessage,
  extractMessage,
  makeSampleCarrier,
  capacityBytes,
} from "../services/steganographyService.js";
import {
  assertNonEmptyImage,
  assertValidPngBuffer,
} from "../middleware/upload.js";
import { sendSuccess, errors } from "../utils/response.js";
import {
  encryptSchema,
  decryptSchema,
  piiDetectSchema,
  maskingSchema,
  pseudonymizeSchema,
  minimizationSchema,
  stegoEmbedSchema,
} from "../utils/validation.js";

/** Mask a base64 secret-ish value for display (shows length + a few chars). */
function maskForDisplay(b64: string): string {
  if (b64.length <= 8) return "*".repeat(b64.length);
  return `${b64.slice(0, 4)}…${b64.slice(-4)} (${b64.length} b64 chars)`;
}

// ---- AES-256-GCM ----

export function postEncrypt(req: Request, res: Response, next: NextFunction): void {
  try {
    const { plaintext } = encryptSchema.parse(req.body);
    const payload = encryptData(plaintext, loadAesKey());
    sendSuccess(res, {
      payload,
      display: {
        nonce: maskForDisplay(payload.nonce),
        tag: maskForDisplay(payload.tag),
      },
      note: "AES-256-GCM authenticated encryption. The key never leaves the backend. A fresh 96-bit nonce is generated per operation.",
    });
  } catch (err) {
    next(err);
  }
}

export function postDecrypt(req: Request, res: Response, next: NextFunction): void {
  try {
    const { payload } = decryptSchema.parse(req.body);
    const plaintext = decryptData(payload as EncryptedPayload, loadAesKey());
    sendSuccess(res, { plaintext, authenticated: true });
  } catch (err) {
    // DecryptionError => validation-style 400 with a safe message.
    if (err instanceof Error && err.name === "DecryptionError") {
      next(errors.validation(err.message));
      return;
    }
    next(err);
  }
}

// ---- PII detection ----

export function postPiiDetect(req: Request, res: Response, next: NextFunction): void {
  try {
    const { text } = piiDetectSchema.parse(req.body);
    sendSuccess(res, detectPii(text));
  } catch (err) {
    next(err);
  }
}

// ---- Data masking ----

export function postMasking(req: Request, res: Response, next: NextFunction): void {
  try {
    const { fields } = maskingSchema.parse(req.body);
    sendSuccess(res, {
      results: maskFields(fields),
      note: "Masking is irreversible redaction for display — it is NOT encryption and provides no confidentiality guarantee by itself.",
    });
  } catch (err) {
    next(err);
  }
}

// ---- Pseudonymization ----

export function postPseudonymize(req: Request, res: Response, next: NextFunction): void {
  try {
    const { identifier, scope, keyVersion, includePlainHashDemo } =
      pseudonymizeSchema.parse(req.body);
    const result = pseudonymize(identifier, { scope, keyVersion });
    sendSuccess(res, {
      ...result,
      plainHashDemo: includePlainHashDemo
        ? {
            value: insecurePlainHashDemo(identifier),
            warning:
              "Plain SHA-256 of a guessable identifier is reversible by dictionary enumeration. Shown only to illustrate why keyed HMAC is used instead.",
          }
        : undefined,
      note: "Pseudonymization (keyed HMAC-SHA256) is NOT anonymization. The secret key stays on the backend. Changing scope or key version changes the pseudonym.",
    });
  } catch (err) {
    next(err);
  }
}

// ---- Data minimization ----

export function postMinimization(req: Request, res: Response, next: NextFunction): void {
  try {
    const { operation, record } = minimizationSchema.parse(req.body);
    const full: FullCertificateRecord =
      (record as FullCertificateRecord) ?? sampleFullRecord();
    sendSuccess(res, {
      ...minimize(full, operation as MinimizationOperation),
      note: "Fields are filtered by an explicit backend allowlist — not by hiding them in the frontend.",
    });
  } catch (err) {
    next(err);
  }
}

export function getMinimizationSample(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { record: sampleFullRecord() });
  } catch (err) {
    next(err);
  }
}

// ---- Visual cryptography ----

export async function postVcSplit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let source: Buffer;
    if (req.file?.buffer) {
      source = assertNonEmptyImage(req.file.buffer);
    } else {
      const text = typeof req.body?.text === "string" ? req.body.text.slice(0, 4) : "CG";
      source = await makeSampleSecret(text || "CG");
    }
    const binary = await binarize(source);
    const { width, height, share1Png, share2Png } = splitShares(binary);
    sendSuccess(res, {
      secretWidth: width,
      secretHeight: height,
      shareWidth: width * 2,
      shareHeight: height * 2,
      share1Base64: share1Png.toString("base64"),
      share2Base64: share2Png.toString("base64"),
      note: "2-out-of-2 Naor–Shamir scheme. Each share alone is random noise; both are required to reveal the secret. 2x pixel expansion; white becomes grey (reduced contrast).",
    });
  } catch (err) {
    next(err);
  }
}

export function postVcReconstruct(req: Request, res: Response, next: NextFunction): void {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const s1 = files?.share1?.[0]?.buffer;
    const s2 = files?.share2?.[0]?.buffer;
    if (!s1 || !s2) {
      throw errors.validation("Both share1 and share2 PNG images are required.");
    }
    assertValidPngBuffer(s1);
    assertValidPngBuffer(s2);
    const result = reconstruct(s1, s2);
    sendSuccess(res, {
      reconstructedBase64: result.toString("base64"),
      note: "Reconstruction stacks the two shares (OR of black subpixels).",
    });
  } catch (err) {
    if (err instanceof Error && /mismatched dimensions/.test(err.message)) {
      next(errors.validation(err.message));
      return;
    }
    next(err);
  }
}

// ---- Steganography ----

export async function postStegoEmbed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message } = stegoEmbedSchema.parse(req.body);
    let carrier: Buffer;
    if (req.file?.buffer) {
      carrier = assertValidPngBuffer(req.file.buffer);
    } else {
      carrier = await makeSampleCarrier();
    }
    const result = await embedMessage(carrier, message);
    sendSuccess(res, {
      ...result,
      note: "LSB steganography hides, it does not encrypt. Anyone who knows the method can extract the message. Encrypt before embedding for confidentiality. PNG (lossless) only.",
    });
  } catch (err) {
    if (err instanceof Error && /too large|non-empty|PNG|dimensions/i.test(err.message)) {
      next(errors.validation(err.message));
      return;
    }
    next(err);
  }
}

export async function postStegoExtract(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const buffer = assertValidPngBuffer(req.file?.buffer);
    const result = await extractMessage(buffer);
    sendSuccess(res, result);
  } catch (err) {
    if (err instanceof Error && /no valid hidden message|PNG|dimensions/i.test(err.message)) {
      next(errors.validation(err.message));
      return;
    }
    next(err);
  }
}

export async function getStegoSampleCarrier(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const carrier = await makeSampleCarrier();
    const meta = { width: 160, height: 120 };
    sendSuccess(res, {
      carrierBase64: carrier.toString("base64"),
      capacityBytes: capacityBytes(meta.width, meta.height),
      ...meta,
    });
  } catch (err) {
    next(err);
  }
}
