import { db } from "../db/database.js";
import { config } from "../config.js";
import { hashPassword, generateSalt } from "../services/authService.js";

async function runReset() {
  const args = process.argv.slice(2);
  const targetEmail = (args[0] || config.adminEmail).trim().toLowerCase();
  const newPassword = args[1] || "DasparAdmin2026!";

  console.log("--------------------------------------------------");
  console.log("  DASPAR Sounds & Entertainment — Admin Reset Tool ");
  console.log("--------------------------------------------------");

  await db.init();

  let admin = db.getAdminByEmail(targetEmail);
  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);

  if (admin) {
    admin.salt = salt;
    admin.passwordHash = passwordHash;
    admin.updatedAt = new Date().toISOString();
    console.log(`[Success] Password successfully reset for existing admin: ${targetEmail}`);
  } else {
    // If admin not found by this email, update the primary admin or create one
    if (db.data.admins.length > 0) {
      admin = db.data.admins[0];
      admin.email = targetEmail;
      admin.salt = salt;
      admin.passwordHash = passwordHash;
      admin.updatedAt = new Date().toISOString();
      console.log(`[Success] Primary administrator updated to: ${targetEmail}`);
    } else {
      admin = {
        id: "admin-default",
        email: targetEmail,
        salt,
        passwordHash,
        role: "admin",
        createdAt: new Date().toISOString(),
      };
      db.data.admins.push(admin);
      console.log(`[Success] New administrator created: ${targetEmail}`);
    }
  }

  // Clear active sessions to force re-login with the new password
  db.data.sessions = [];
  await db.save();

  await db.logAudit({
    adminEmail: targetEmail,
    action: "CLI_PASSWORD_RESET",
    details: "Administrator password reset via CLI tool",
  });

  console.log("--------------------------------------------------");
  console.log("New Login Credentials:");
  console.log(`  Email:    ${targetEmail}`);
  console.log(`  Password: ${newPassword}`);
  console.log("All existing sessions have been terminated.");
  console.log("--------------------------------------------------");
}

runReset().catch((err) => {
  console.error("[Error] Failed to reset administrator:", err);
  process.exit(1);
});
