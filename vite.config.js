import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(projectRoot, "client");

export default defineConfig({
  root: siteRoot,
  base: process.env.PAGES_BASE_PATH || "/",
  publicDir: path.resolve(siteRoot, "public"),
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: false,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(projectRoot, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: path.resolve(siteRoot, "index.html"),
        products: path.resolve(siteRoot, "products.html"),
        services: path.resolve(siteRoot, "services.html"),
        delivery: path.resolve(siteRoot, "delivery.html"),
        contact: path.resolve(siteRoot, "contact.html"),
        adminLogin: path.resolve(siteRoot, "admin/login.html"),
        adminDashboard: path.resolve(siteRoot, "admin/dashboard.html"),
      },
    },
  },
});
