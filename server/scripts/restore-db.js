import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { backupEncryptionKey, backupKeyId, postgresClientEnvironment, runPostgresUtility } from "./backup-helpers.js";

const headerPrefix = Buffer.from("DASPARBK1", "ascii");
const keyIdLength = 12;
const ivLength = 12;
const tagLength = 16;
const headerLength = headerPrefix.length + keyIdLength + ivLength;

async function restoreBackup() {
  if (process.env.RESTORE_CONFIRM !== "RESTORE_DASPAR_DATABASE") {
    throw new Error("Restore refused. Set RESTORE_CONFIRM=RESTORE_DASPAR_DATABASE only after confirming the configured database may be overwritten.");
  }
  const inputArgument = process.argv[2];
  if (!inputArgument) throw new Error("Provide the encrypted backup file path as the first argument.");
  const inputPath = path.resolve(process.cwd(), inputArgument);
  const stat = await fs.lstat(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= headerLength + tagLength) throw new Error("The encrypted backup file is invalid or too small.");

  const key = backupEncryptionKey();
  const expectedKeyId = backupKeyId(key);
  const handle = await fs.open(inputPath, "r");
  const header = Buffer.alloc(headerLength);
  const tag = Buffer.alloc(tagLength);
  try {
    const headerRead = await handle.read(header, 0, headerLength, 0);
    const tagRead = await handle.read(tag, 0, tagLength, stat.size - tagLength);
    if (headerRead.bytesRead !== headerLength || tagRead.bytesRead !== tagLength || !header.subarray(0, headerPrefix.length).equals(headerPrefix)) {
      throw new Error("The encrypted backup format is not recognized.");
    }
  } finally {
    await handle.close();
  }
  if (header.subarray(headerPrefix.length, headerPrefix.length + keyIdLength).toString("ascii") !== expectedKeyId) {
    throw new Error("The configured backup key does not match this encrypted backup.");
  }

  const ivStart = headerPrefix.length + keyIdLength;
  const iv = header.subarray(ivStart, ivStart + ivLength);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "daspar-restore-"));
  const plaintextPath = path.join(temporaryDirectory, "database.pgdump");
  try {
    await fs.chmod(temporaryDirectory, 0o700);
    await pipeline(
      createReadStream(inputPath, { start: headerLength, end: stat.size - tagLength - 1 }),
      decipher,
      createWriteStream(plaintextPath, { flags: "wx", mode: 0o600 }),
    );
    await fs.chmod(plaintextPath, 0o600);
    const postgresEnvironment = postgresClientEnvironment();
    await runPostgresUtility("pg_restore", [
      "--clean", "--if-exists", "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction",
      "--dbname", postgresEnvironment.PGDATABASE, plaintextPath,
    ], postgresEnvironment);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

restoreBackup().then(() => {
  console.log("Database restore completed. Verify application health and data before reopening customer/admin traffic.");
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
