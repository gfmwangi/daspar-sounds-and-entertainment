import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { config } from "../config.js";

const libpqEnvironmentByOption = new Map([
  ["hostaddr", "PGHOSTADDR"], ["sslnegotiation", "PGSSLNEGOTIATION"],
  ["channel_binding", "PGCHANNELBINDING"], ["service", "PGSERVICE"], ["servicefile", "PGSERVICEFILE"],
  ["require_auth", "PGREQUIREAUTH"], ["options", "PGOPTIONS"], ["application_name", "PGAPPNAME"],
  ["sslmode", "PGSSLMODE"], ["sslcompression", "PGSSLCOMPRESSION"], ["sslcert", "PGSSLCERT"],
  ["sslkey", "PGSSLKEY"], ["sslcertmode", "PGSSLCERTMODE"], ["sslrootcert", "PGSSLROOTCERT"],
  ["sslcrl", "PGSSLCRL"], ["sslcrldir", "PGSSLCRLDIR"], ["sslsni", "PGSSLSNI"],
  ["requirepeer", "PGREQUIREPEER"], ["ssl_min_protocol_version", "PGSSLMINPROTOCOLVERSION"],
  ["ssl_max_protocol_version", "PGSSLMAXPROTOCOLVERSION"], ["gssencmode", "PGGSSENCMODE"],
  ["krbsrvname", "PGKRBSRVNAME"], ["gsslib", "PGGSSLIB"], ["gssdelegation", "PGGSSDELEGATION"],
  ["connect_timeout", "PGCONNECT_TIMEOUT"], ["client_encoding", "PGCLIENTENCODING"],
  ["target_session_attrs", "PGTARGETSESSIONATTRS"], ["load_balance_hosts", "PGLOADBALANCEHOSTS"],
  ["min_protocol_version", "PGMINPROTOCOLVERSION"], ["max_protocol_version", "PGMAXPROTOCOLVERSION"],
]);

function decoded(value) {
  try { return decodeURIComponent(value); } catch { throw new Error("DATABASE_URL contains invalid percent encoding."); }
}

function runtimeEnvironment() {
  const environment = {};
  for (const name of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "LC_CTYPE", "SYSTEMROOT", "WINDIR", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH", "PGPASSFILE"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}

export function postgresClientEnvironment(databaseUrl = config.databaseUrl) {
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL is not a valid PostgreSQL connection URL."); }
  const params = url.searchParams;
  const seen = new Set();
  for (const key of params.keys()) {
    if (seen.has(key)) throw new Error(`DATABASE_URL repeats the PostgreSQL connection option '${key}'.`);
    seen.add(key);
  }

  const environment = runtimeEnvironment();
  const host = params.get("host") || url.hostname;
  const port = params.get("port") || url.port || "5432";
  const database = params.get("dbname") || decoded(url.pathname.replace(/^\//, ""));
  const user = params.get("user") || decoded(url.username);
  const password = params.has("password") ? params.get("password") : decoded(url.password);
  if (!host || !database || !user) throw new Error("DATABASE_URL must include a PostgreSQL host, database, and user.");

  environment.PGHOST = host;
  environment.PGPORT = port;
  environment.PGDATABASE = database;
  environment.PGUSER = user;
  if (password) environment.PGPASSWORD = password;

  for (const [key, value] of params.entries()) {
    if (["host", "port", "dbname", "user", "password"].includes(key)) continue;
    if (key === "ssl") {
      if (!/^(true|false)$/i.test(value) || params.has("sslmode")) {
        throw new Error("DATABASE_URL has an ambiguous or invalid 'ssl' connection option.");
      }
      environment.PGSSLMODE = value.toLowerCase() === "true" ? "require" : "disable";
      continue;
    }
    const environmentName = libpqEnvironmentByOption.get(key);
    if (!environmentName) {
      throw new Error(`DATABASE_URL contains the unsupported PostgreSQL connection option '${key}'. Backup utilities will not silently drop provider connection options.`);
    }
    environment[environmentName] = value;
  }

  if (!environment.PGSSLMODE) environment.PGSSLMODE = config.databaseSsl ? "verify-full" : "prefer";
  if (!environment.PGAPPNAME) environment.PGAPPNAME = "daspar-secure-backup";
  return environment;
}

export function runPostgresUtility(binary, args, env = postgresClientEnvironment()) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: ["ignore", "ignore", "ignore"] });
    child.once("error", () => reject(new Error(`${binary} could not be started. Install the PostgreSQL client tools and retry.`)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${binary} failed with exit code ${code ?? "unknown"}. No credential or database output was logged.`));
    });
  });
}

export function backupEncryptionKey() {
  const value = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be configured as a private 64-character hexadecimal key.");
  }
  return Buffer.from(value, "hex");
}

export function backupKeyId(key) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function backupRetentionDays() {
  const days = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("BACKUP_RETENTION_DAYS must be an integer from 1 to 3650.");
  return days;
}
