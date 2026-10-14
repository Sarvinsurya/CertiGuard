import { bootstrap, createApp, validateProductionConfig } from "./app.js";
import { config } from "./config/index.js";
import { closeDb } from "./db/connection.js";

bootstrap();
validateProductionConfig();
const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[CertiGuard] Backend listening on http://localhost:${config.port} (env=${config.env})`
  );
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`[CertiGuard] ${signal} received, shutting down gracefully...`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
