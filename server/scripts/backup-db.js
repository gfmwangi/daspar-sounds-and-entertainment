import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";
import { backupEncryptionKey, backupKeyId, backupRetentionDays, postgresClientEnvironment } from "./backup-helpers.js";

const headerPrefix = Buffer.from("DASPARBK1", "ascii");
const backupDirectory = path.resolve(config.projectRoot, process.env.BACKUP_DIR || "backups");

function waitForSuccessfulExit(child, binary) {
  return new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error(`${binary} could not be started. Install the PostgreSQL client tools and retry.`)));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`${binary} failed with exit code ${code ?? "unknown"}.`)));
  });
}

async function pruneExpiredBackups() {
  const cutoff = Date.now() - backupRetentionDays() * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of await fs.readdir(backupDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^daspar-\d{8}T\d{6}Z-[a-f0-9]{8}\.pgdump\.enc$/.test(entry.name)) continue;
    const filePath = path.join(backupDirectory, entry.name);
    const stat = await fs.lstat(filePath);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(filePath);
      removed += 1;
    }
  }
  return removed;
}

async function createBackup() {
  const key = backupEncryptionKey();
  const id = backupKeyId(key);
  await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await fs.chmod(backupDirectory, 0o700);

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `daspar-${timestamp}-${crypto.randomBytes(4).toString("hex")}.pgdump.enc`;
  const destination = path.join(backupDirectory, filename);
  const temporary = `${destination}.partial-${crypto.randomUUID()}`;
  const iv = crypto.randomBytes(12);
  const keyIdBytes = Buffer.from(id, "ascii");
  const header = Buffer.concat([headerPrefix, keyIdBytes, iv]);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const output = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
  let child;

  try {
    await new Promise((resolve, reject) => {
      output.once("open", resolve);
      output.once("error", reject);
    });
    if (!output.write(header)) await new Promise((resolve, reject) => { output.once("drain", resolve); output.once("error", reject); });
    child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--no-password"], {
      env: postgresClientEnvironment(),
      stdio: ["ignore", "pipe", "ignore"],
    });
    const processDone = waitForSuccessfulExit(child, "pg_dump");
    const streamDone = pipeline(child.stdout, cipher, output);
    await Promise.all([processDone, streamDone]);
    await fs.appendFile(temporary, cipher.getAuthTag(), { mode: 0o600 });
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, destination);
    let removed = 0;
    let retentionCleanupFailed = false;
    try { removed = await pruneExpiredBackups(); } catch { retentionCleanupFailed = true; }
    return { filename, removed, retentionCleanupFailed };
  } catch {
    child?.kill("SIGTERM");
    output.destroy();
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new Error("Encrypted database backup failed. Check PostgreSQL client availability, database access, and private backup settings; no unencrypted dump was retained.");
  }
}

createBackup().then(({ filename, removed, retentionCleanupFailed }) => {
  console.log(`Encrypted PostgreSQL backup created: ${filename}`);
  if (retentionCleanupFailed) console.warn("Backup retention cleanup could not be completed; the new encrypted backup is intact.");
  else console.log(`Expired encrypted backups removed: ${removed}`);
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
