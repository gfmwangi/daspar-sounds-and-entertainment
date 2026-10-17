import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { db } from "./db/database.js";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxyHops);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: config.isProduction ? undefined : false,
  }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use((req, res, next) => {
    const healthProbe = req.path === "/api/health" && (req.method === "GET" || req.method === "HEAD");
    if (config.isProduction && !req.secure && !healthProbe) {
      res.setHeader("Cache-Control", "no-store, private");
      return res.status(426).json({ error: "HTTPS is required for this service." });
    }
    next();
  });

  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by this API."));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Requested-With"],
    maxAge: 600,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "32kb", parameterLimit: 50 }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/admin")) {
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });

  const clientAssets = path.resolve(config.clientDir, "public/assets");
  if (fs.existsSync(clientAssets)) app.use("/assets", express.static(clientAssets, { fallthrough: true, index: false, maxAge: config.isProduction ? "1h" : 0 }));

  app.get("/api/health", async (req, res) => {
    try {
      await db.ping();
      res.status(200).json({ status: "healthy" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use("/api/public", publicRoutes);
  app.use("/api", publicRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint not found" }));

  for (const [route, file] of [
    ["/admin", "admin/login.html"], ["/admin/", "admin/login.html"], ["/admin/login", "admin/login.html"],
    ["/admin/setup", "admin/setup.html"],
    ["/admin/dashboard", "admin/dashboard.html"],
    ["/admin/forgot-password", "admin/forgot-password.html"],
    ["/admin/reset-password", "admin/reset-password.html"],
  ]) {
    app.get(route, (req, res) => res.sendFile(path.resolve(config.staticDir, file)));
  }

  if (fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir, { fallthrough: true, index: "index.html" }));
    const knownPages = new Set(["products", "services", "delivery", "contact", "admin/login", "admin/setup", "admin/dashboard", "admin/forgot-password", "admin/reset-password"]);
    app.get("*", (req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      let page;
      try {
        page = decodeURIComponent(req.path).replace(/^\/+|\/+$/g, "");
      } catch {
        return res.status(400).send("Invalid URL.");
      }
      if (page === "") return res.sendFile(path.resolve(config.staticDir, "index.html"));
      if (page.endsWith(".html")) page = page.slice(0, -5);
      if (!knownPages.has(page)) return res.status(404).send("Page not found.");
      return res.sendFile(path.resolve(config.staticDir, `${page}.html`));
    });
  }

  app.use((req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error(`[request:${req.requestId || "unknown"}] ${err.name || "Error"}`);
    const originError = err.message === "Origin is not allowed by this API.";
    res.status(originError ? 403 : status).json({
      error: originError ? "This website origin is not allowed." : "Request could not be completed.",
      requestId: req.requestId,
    });
  });
  return app;
}
