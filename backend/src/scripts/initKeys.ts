import { bootstrap } from "../app.js";
import { issuerKeyExists, privateKeyPath, ensureAllKeys } from "../crypto/keyManager.js";

bootstrap(); // runs migrations + ensures issuer + AES + HMAC keys

const existed = issuerKeyExists();
ensureAllKeys();

// eslint-disable-next-line no-console
console.log(
  existed
    ? `[CertiGuard] Keys already present (issuer at ${privateKeyPath()}); AES + HMAC keys ensured.`
    : `[CertiGuard] Generated issuer Ed25519 keypair, AES-256 key, and HMAC pseudonymization key under the keys/ directory.`
);
