import { db } from "../db/database.js";

try {
  await db.init();
  console.log("Database migrations are current and catalogue seed initialization completed.");
} catch (error) {
  console.error(`[Database migration] ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
}
