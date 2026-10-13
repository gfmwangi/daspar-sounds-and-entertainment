import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Load environment variables from .env file if present
dotenv.config({ path: path.resolve(projectRoot, ".env") });

const nodeEnv = process.env.NODE_ENV || "development";
if (nodeEnv === "production") {
  throw new Error("This review branch is not production-ready and cannot start with NODE_ENV=production.");
}
if (!new Set(["development", "test"]).has(nodeEnv)) {
  throw new Error("NODE_ENV must be development or test for this review branch.");
}

const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminInitialPassword = process.env.ADMIN_INITIAL_PASSWORD || "";
if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error("Set a valid, disposable ADMIN_EMAIL in your private local .env file.");
}
if (adminInitialPassword.length < 16) {
  throw new Error("Set a test-only ADMIN_INITIAL_PASSWORD of at least 16 characters in your private local .env file.");
}

function parseOrigins(value) {
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((origin) => {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(`Invalid CORS origin configuration: ${origin}`);
      }
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
        throw new Error(`CORS entries must be origins only (no paths or credentials): ${origin}`);
      }
      return parsed.origin;
    });
}

const port = Number.parseInt(process.env.PORT || "5000", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PORT must be an integer between 1024 and 65535.");
}

const serverHost = process.env.SERVER_HOST || "127.0.0.1";
if (!["127.0.0.1", "::1", "localhost"].includes(serverHost)) {
  throw new Error("SERVER_HOST must be a loopback address for this local-only review branch.");
}

export const config = {
  projectRoot,
  port,
  host: serverHost,
  nodeEnv,
  isProduction: false,
  adminEmail,
  adminInitialPassword,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000"),
  productUploadsDir: path.resolve(projectRoot, process.env.PRODUCT_UPLOADS_DIR || "data/uploads/products"),
  databaseFile: path.resolve(projectRoot, process.env.DATA_FILE || "data/daspar-store.json"),
  staticDir: path.resolve(projectRoot, "dist/public"),
  clientDir: path.resolve(projectRoot, "client"),
};
