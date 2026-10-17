import { config } from "./config.js";
import { db } from "./db/database.js";
import { createApp } from "./app.js";

async function startServer() {
  await db.init();
  const [stats, categories] = await Promise.all([db.getStats(), db.getCategories()]);
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(config.port, config.host, () => resolve(instance));
    instance.once("error", reject);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  console.log(`[Server] DASPAR API listening on ${config.host}:${config.port} (${config.nodeEnv}).`);
  console.log(`[Database] PostgreSQL ready; ${stats.totalProducts} catalogue items across ${categories.length} categories.`);
  console.log("[Admin] No default account is created. The owner must complete the single-use first-owner setup flow.");

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received; closing gracefully.`);
    server.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(async (error) => {
  console.error(`[Fatal] Backend startup failed: ${error.name || "Error"}. Verify the private runtime configuration and database, then retry.`);
  await db.close().catch(() => {});
  process.exitCode = 1;
});
