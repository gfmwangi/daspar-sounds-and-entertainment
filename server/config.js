import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeEnv = process.env.NODE_ENV || "development";
if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error("NODE_ENV must be development, test, or production.");
}
const isProduction = nodeEnv === "production";

function parseOrigin(value, name) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin.`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value || url.username || url.password) {
    throw new Error(`${name} must contain only an origin (scheme and host), with no path or credentials.`);
  }
  return url.origin;
}

function parseOrigins(value) {
  return [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => parseOrigin(item, "CORS_ORIGINS")))];
}

const port = Number.parseInt(process.env.PORT || "5000", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PORT must be an integer between 1024 and 65535.");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Configure a private PostgreSQL connection string before starting the server.");
}
let databaseProtocol;
let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
  databaseProtocol = parsedDatabaseUrl.protocol;
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
}
if (!["postgres:", "postgresql:"].includes(databaseProtocol)) {
  throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
}
for (const option of ["sslmode", "ssl"]) {
  if (parsedDatabaseUrl.searchParams.getAll(option).length > 1) {
    throw new Error(`DATABASE_URL must not repeat the '${option}' PostgreSQL TLS option.`);
  }
}
const databaseSslAlias = (parsedDatabaseUrl.searchParams.get("ssl") || "").toLowerCase();
const databaseSslMode = (parsedDatabaseUrl.searchParams.get("sslmode") || (databaseSslAlias === "true" ? "require" : "")).toLowerCase();
const databaseSsl = process.env.DATABASE_SSL === "true";
const tlsRequiredSslModes = ["require", "verify-ca", "verify-full"];
if (isProduction && databaseSslAlias && parsedDatabaseUrl.searchParams.has("sslmode")) {
  throw new Error("Production DATABASE_URL must not combine the 'ssl' alias with 'sslmode'.");
}
if (isProduction && databaseSslAlias && databaseSslAlias !== "true") {
  throw new Error("Production DATABASE_URL must not disable PostgreSQL TLS.");
}
if (isProduction && databaseSslMode && !tlsRequiredSslModes.includes(databaseSslMode)) {
  throw new Error("Production DATABASE_URL must use sslmode=require, verify-ca, or verify-full; non-required SSL modes are not allowed.");
}
if (isProduction && !databaseSsl && !tlsRequiredSslModes.includes(databaseSslMode)) {
  throw new Error("Production requires PostgreSQL TLS: set DATABASE_SSL=true for a trusted certificate or use a TLS-required sslmode in DATABASE_URL.");
}

const publicOrigin = parseOrigin(process.env.PUBLIC_ORIGIN?.trim(), "PUBLIC_ORIGIN");
const configuredOrigins = parseOrigins(process.env.CORS_ORIGINS || (isProduction ? "" : "http://localhost:3000,http://127.0.0.1:3000"));
const corsOrigins = [...new Set([...configuredOrigins, ...(publicOrigin ? [publicOrigin] : [])])];
if (isProduction && (!publicOrigin || corsOrigins.length === 0)) {
  throw new Error("Production requires PUBLIC_ORIGIN and an exact CORS_ORIGINS allowlist.");
}
if (isProduction && new URL(publicOrigin).protocol !== "https:") {
  throw new Error("Production PUBLIC_ORIGIN must use HTTPS so administrator sessions and password-reset links are protected in transit.");
}
if (isProduction && corsOrigins.some((origin) => new URL(origin).protocol !== "https:")) {
  throw new Error("Every production CORS_ORIGINS entry must use HTTPS.");
}

const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || (isProduction ? "1" : "0"), 10);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
  throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 5.");
}

const host = process.env.SERVER_HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
if (!isProduction && !["127.0.0.1", "::1", "localhost", "0.0.0.0"].includes(host)) {
  throw new Error("In local development, SERVER_HOST must be a loopback address or 0.0.0.0.");
}
if (isProduction && host !== "0.0.0.0") {
  throw new Error("Production SERVER_HOST must be 0.0.0.0 so the hosting service can route requests.");
}

const cookieSameSite = (process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
if (!["lax", "strict", "none"].includes(cookieSameSite)) {
  throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
}
const cookieSecure = isProduction || process.env.COOKIE_SECURE === "true";
if (isProduction && cookieSameSite === "none" && !cookieSecure) {
  throw new Error("SameSite=None cookies require secure HTTPS cookies in production.");
}

const sessionSecret = process.env.SESSION_SECRET || "";
if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
  throw new Error("SESSION_SECRET must be set to a random value of at least 32 bytes.");
}

const sessionTtlHours = Number.parseInt(process.env.SESSION_TTL_HOURS || "12", 10);
if (!Number.isInteger(sessionTtlHours) || sessionTtlHours < 1 || sessionTtlHours > 168) {
  throw new Error("SESSION_TTL_HOURS must be an integer from 1 to 168.");
}

export const config = Object.freeze({
  projectRoot,
  nodeEnv,
  isProduction,
  port,
  host,
  trustProxyHops,
  databaseUrl,
  databaseSsl,
  sessionSecret,
  publicOrigin,
  corsOrigins,
  cookieSameSite,
  cookieSecure,
  sessionTtlHours,
  loginWindowSeconds: Number.parseInt(process.env.LOGIN_WINDOW_SECONDS || "900", 10),
  loginMaxAttempts: Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5", 10),
  contactWindowSeconds: Number.parseInt(process.env.CONTACT_WINDOW_SECONDS || "900", 10),
  contactMaxAttempts: Number.parseInt(process.env.CONTACT_MAX_ATTEMPTS || "5", 10),
  uploadMaxBytes: 10 * 1024 * 1024,
  uploadMaxFiles: 10,
  cloudinaryUrl: process.env.CLOUDINARY_URL || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "",
  contactRecipientEmail: process.env.CONTACT_RECIPIENT_EMAIL || "dasparent@outlook.com",
  staticDir: path.resolve(projectRoot, "dist/public"),
  clientDir: path.resolve(projectRoot, "client"),
  productAssetsDir: path.resolve(projectRoot, "client/public/assets/products"),
});
