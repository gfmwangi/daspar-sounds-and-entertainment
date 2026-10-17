import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(pool) {
  const files = (await fs.readdir(migrationDirectory))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) throw new Error("No database migration files were found.");

  for (const file of files) {
    const version = file.slice(0, file.indexOf("_"));
    const sql = await fs.readFile(path.join(migrationDirectory, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["daspar:migrations"]);
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (applied.rowCount === 0) {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Database migration ${file} failed; no changes from that migration were committed.`, { cause: error });
    } finally {
      client.release();
    }
  }

  return files.map((file) => file.slice(0, file.indexOf("_")));
}
