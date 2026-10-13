import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, false);
        return callback(null, config.corsOrigins.includes(origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  );

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: "64kb" }));
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));

  const clientPublicDir = path.resolve(config.clientDir, "public");
  const assetsDir = path.resolve(clientPublicDir, "assets");
  app.use("/uploads/products", express.static(config.productUploadsDir, { fallthrough: true, index: false }));
  app.use("/daspar-sounds-and-entertainment/uploads/products", express.static(config.productUploadsDir, { fallthrough: true, index: false }));
  if (fs.existsSync(assetsDir)) {
    app.use("/assets", express.static(assetsDir, { fallthrough: true, index: false }));
    app.use("/daspar-sounds-and-entertainment/assets", express.static(assetsDir, { fallthrough: true, index: false }));
  }

  // API Routes
  app.use("/api/public", publicRoutes);
  app.use("/api", publicRoutes); // Allows both /api/contact-inquiries and /api/public/products
  app.use("/api/admin", adminRoutes);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Serve static production build if it exists (for unified hosting on Render, Railway, etc.)
  if (fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir));

    // Handle HTML subpaths without .html if needed
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      const possibleFile = path.resolve(config.staticDir, `${req.path.replace(/^\//, "")}.html`);
      if (fs.existsSync(possibleFile)) {
        return res.sendFile(possibleFile);
      }
      res.sendFile(path.resolve(config.staticDir, "index.html"));
    });
  }

  // 404 for unhandled API routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error("[Server Error]", err.message);
    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: config.isProduction ? "An unexpected error occurred." : err.message,
    });
  });

  return app;
}
