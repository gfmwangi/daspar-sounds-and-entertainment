import { config } from "./config.js";
import { db } from "./db/database.js";
import { createApp } from "./app.js";

async function startServer() {
  try {
    console.log("DASPAR Sounds & Entertainment — local backend review mode");

    // Initialize the local JSON review store.
    await db.init();
    const stats = db.getStats();
    console.log(`[Local store] Read ${stats.totalProducts} products across ${db.getCategories().length} categories.`);
    console.log(`[Local store] ${stats.totalPhotos} referenced catalogue photos.`);

    const app = createApp();

    app.listen(config.port, config.host, () => {
      console.log(`[Server] Listening at http://${config.host}:${config.port}`);
      console.log(`[API] Health check: http://${config.host}:${config.port}/api/health`);
      console.log("[Server] No email delivery or production datastore is configured.");
    });
  } catch (error) {
    console.error("[Startup Error]", error.message);
    process.exit(1);
  }
}

startServer();
