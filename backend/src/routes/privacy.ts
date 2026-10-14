import { Router } from "express";
import { uploadSingleImage, uploadTwoShares } from "../middleware/upload.js";
import {
  postEncrypt,
  postDecrypt,
  postPiiDetect,
  postMasking,
  postPseudonymize,
  postMinimization,
  getMinimizationSample,
  postVcSplit,
  postVcReconstruct,
  postStegoEmbed,
  postStegoExtract,
  getStegoSampleCarrier,
} from "../controllers/privacyController.js";

export const privacyRouter = Router();

// AES-256-GCM
privacyRouter.post("/encrypt", postEncrypt);
privacyRouter.post("/decrypt", postDecrypt);

// PII detection
privacyRouter.post("/pii/detect", postPiiDetect);

// Data masking
privacyRouter.post("/masking/demo", postMasking);

// Pseudonymization
privacyRouter.post("/pseudonymize", postPseudonymize);

// Data minimization
privacyRouter.get("/minimization/sample", getMinimizationSample);
privacyRouter.post("/minimization/demo", postMinimization);

// Visual cryptography
privacyRouter.post("/visual-cryptography/split", uploadSingleImage, postVcSplit);
privacyRouter.post("/visual-cryptography/reconstruct", uploadTwoShares, postVcReconstruct);

// Steganography
privacyRouter.get("/steganography/sample-carrier", getStegoSampleCarrier);
privacyRouter.post("/steganography/embed", uploadSingleImage, postStegoEmbed);
privacyRouter.post("/steganography/extract", uploadSingleImage, postStegoExtract);
