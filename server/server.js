import { config } from "./config.js";
import { db } from "./db/database.js";
import { createApp } from "./app.js";

async function startServer() {
  try {
    console.log("--------------------------------------------------");
    console.log("  DASPAR Sounds & Entertainment — Backend Server   ");
    console.log("--------------------------------------------------");

    // Initialize and auto-seed persistent database
    await db.init();
    const stats = db.getStats();
    console.log(`[Database] Initialized with ${stats.totalProducts} products across ${db.getCategories().length} categories.`);
    console.log(`[Database] Image assets tracked: ${stats.totalPhotos}`);

    const app = createApp();

    app.listen(config.port, "0.0.0.0", () => {
      console.log(`[Server] Listening at http://localhost:${config.port}`);
      console.log(`[API] Health check: http://localhost:${config.port}/api/health`);
      console.log(`[API] Public products: http://localhost:${config.port}/api/public/products`);
      console.log(`[Admin] Initial administrator account: ${config.adminEmail}`);
      console.log("--------------------------------------------------");
    });
  } catch (error) {
    console.error("[Fatal Error] Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
