import { db } from "../db/database.js";

async function main() {
  const email = process.env.ADMIN_SETUP_EMAIL || "";
  const password = process.env.ADMIN_SETUP_PASSWORD || "";
  if (!email || !password) throw new Error("Set ADMIN_SETUP_EMAIL and ADMIN_SETUP_PASSWORD in a private environment before running this one-time command.");
  try {
    await db.init();
    const admin = await db.createInitialAdmin({ email, password });
    let auditSaved = true;
    try {
      await db.logAudit({ adminId: admin.id, adminEmail: admin.email, action: "INITIAL_ADMIN_CREATED", details: "Initial owner account created through the private setup command" });
    } catch {
      auditSaved = false;
    }
    console.log("Initial administrator account created. The password was not displayed or logged.");
    if (!auditSaved) console.warn("Warning: the account was created, but the audit entry could not be written. Do not rerun account creation; investigate database audit logging.");
  } finally {
    process.env.ADMIN_SETUP_EMAIL = "";
    process.env.ADMIN_SETUP_PASSWORD = "";
    await db.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[Admin setup] ${error.message}`);
  process.exitCode = 1;
});
