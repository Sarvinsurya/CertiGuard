import multer from "multer";
import path from "node:path";
import type { Request } from "express";
import { config } from "../config/index.js";
import { errors } from "../utils/response.js";

/**
 * In-memory upload handling. We keep the bytes in memory so we can hash them
 * exactly and only persist registered documents to the private storage dir.
 * This avoids leaving arbitrary user files on disk and avoids user-controlled
 * file paths.
 */
const storage = multer.memoryStorage();

export const uploadSinglePdf = multer({
  storage,
  limits: { fileSize: config.upload.maxFileBytes, files: 1 },
  fileFilter: (_req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const extOk = config.upload.allowedExt.includes(ext);
    const mimeOk = config.upload.allowedMime.includes(file.mimetype);
    if (!extOk || !mimeOk) {
      cb(errors.validation("Only PDF files (.pdf, application/pdf) are accepted."));
      return;
    }
    cb(null, true);
  },
}).single("file");

/**
 * Validate the actual PDF signature (magic bytes). A real PDF begins with "%PDF-".
 * Extension and MIME type alone are not trustworthy, so we check the bytes.
 */
export function assertValidPdfBuffer(buffer: Buffer | undefined): Buffer {
  if (!buffer || buffer.length === 0) {
    throw errors.validation("No file was uploaded or the file is empty.");
  }
  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw errors.validation(
      "The uploaded file is not a valid PDF (missing %PDF- signature)."
    );
  }
  return buffer;
}

/* -------------------------------------------------------------------------- */
/* Phase 2: image uploads for visual cryptography and steganography.          */
/* -------------------------------------------------------------------------- */

const IMAGE_MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const IMAGE_EXT = [".png", ".bmp", ".jpg", ".jpeg", ".webp"];
const IMAGE_MIME = ["image/png", "image/bmp", "image/jpeg", "image/webp"];

const imageMulter = multer({
  storage,
  limits: { fileSize: IMAGE_MAX_BYTES, files: 2 },
  fileFilter: (_req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXT.includes(ext) || !IMAGE_MIME.includes(file.mimetype)) {
      cb(errors.validation("Only image files (PNG/BMP/JPG/WEBP) are accepted."));
      return;
    }
    cb(null, true);
  },
});

/** Single image under field name "image". */
export const uploadSingleImage = imageMulter.single("image");

/** Two images under field names "share1" and "share2" (visual crypto reconstruct). */
export const uploadTwoShares = imageMulter.fields([
  { name: "share1", maxCount: 1 },
  { name: "share2", maxCount: 1 },
]);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG

/** Assert the buffer is a PNG (magic bytes). */
export function assertValidPngBuffer(buffer: Buffer | undefined): Buffer {
  if (!buffer || buffer.length < 8) {
    throw errors.validation("No image was uploaded or the image is empty.");
  }
  if (!buffer.subarray(0, 4).equals(PNG_MAGIC)) {
    throw errors.validation("The uploaded image is not a valid PNG file.");
  }
  return buffer;
}

/** Assert a non-empty image buffer (format validated downstream by sharp). */
export function assertNonEmptyImage(buffer: Buffer | undefined): Buffer {
  if (!buffer || buffer.length === 0) {
    throw errors.validation("No image was uploaded or the image is empty.");
  }
  return buffer;
}
