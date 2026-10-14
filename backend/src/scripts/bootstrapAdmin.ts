import { bootstrap } from "../app.js";
import { config } from "../config/index.js";

/**
 * Provision the initial administrator from environment variables:
 *   CERTIGUARD_ADMIN_EMAIL, CERTIGUARD_ADMIN_PASSWORD, [CERTIGUARD_ADMIN_NAME]
 * bootstrap() runs the admin provisioning (idempotent; only if no admin exists).
 */
if (!config.adminBootstrap.email || !config.adminBootstrap.password) {
  // eslint-disable-next-line no-console
  console.error(
    "[CertiGuard] Set CERTIGUARD_ADMIN_EMAIL and CERTIGUARD_ADMIN_PASSWORD before running this command."
  );
  process.exit(1);
}
bootstrap();
// eslint-disable-next-line no-console
console.log("[CertiGuard] Admin bootstrap complete (no-op if an administrator already exists).");
