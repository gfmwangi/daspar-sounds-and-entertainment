import { db } from "../db/database.js";

async function main() {
  const email = process.env.ADMIN_RESET_EMAIL || "";
  const password = process.env.ADMIN_RESET_PASSWORD || "";
  if (!email || !password) throw new Error("Set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD in a private environment before running this command.");
  try {
    await db.init();
    const admin = await db.getAdminByEmail(email);
    if (!admin) throw new Error("No administrator exists for the configured email.");
    const updatedEmail = await db.setAdminPassword(admin.id, password);
    let auditSaved = true;
    try {
      await db.logAudit({ adminId: admin.id, adminEmail: updatedEmail, action: "CLI_PASSWORD_RESET", details: "Administrator password reset through the private maintenance command" });
    } catch {
      auditSaved = false;
    }
    console.log("Administrator password updated. All active sessions were invalidated; no credentials were displayed or logged.");
    if (!auditSaved) console.warn("Warning: the password was changed, but the audit entry could not be written. Do not rerun the reset unnecessarily; investigate database audit logging.");
  } finally {
    process.env.ADMIN_RESET_EMAIL = "";
    process.env.ADMIN_RESET_PASSWORD = "";
    await db.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[Admin password reset] ${error.message}`);
  process.exitCode = 1;
});
