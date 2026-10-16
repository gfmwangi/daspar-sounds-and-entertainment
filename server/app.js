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

  // Basic security and parsing middleware
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin)
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, true); // For development flexibility
        }
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static serving for assets (photos, logo)
  const clientPublicDir = path.resolve(config.clientDir, "public");
  if (fs.existsSync(clientPublicDir)) {
    app.use("/assets", express.static(path.resolve(clientPublicDir, "assets")));
    app.use("/daspar-sounds-and-entertainment/assets", express.static(path.resolve(clientPublicDir, "assets")));
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
    console.error("[Server Error]", err);
    res.status(err.status || 500).json({
      error: "Internal Server Error",
      message: config.isProduction ? "An unexpected error occurred." : err.message,
    });
  });

  return app;
}
