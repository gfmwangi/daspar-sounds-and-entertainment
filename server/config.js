import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Load environment variables from .env file if present
dotenv.config({ path: path.resolve(projectRoot, ".env") });

export const config = {
  projectRoot,
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  sessionSecret: process.env.SESSION_SECRET || "daspar_default_secret_key_change_in_production",
  adminEmail: (process.env.ADMIN_EMAIL || "admin@daspar.co.ke").trim().toLowerCase(),
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD || "DasparAdmin2026!",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  productAssetsDir: path.resolve(projectRoot, process.env.PRODUCT_ASSETS_DIR || "client/public/assets/products"),
  contactRecipientEmail: process.env.CONTACT_RECIPIENT_EMAIL || "dasparent@outlook.com",
  databaseFile: path.resolve(projectRoot, "data/daspar-store.json"),
  staticDir: path.resolve(projectRoot, "dist/public"),
  clientDir: path.resolve(projectRoot, "client"),
};
