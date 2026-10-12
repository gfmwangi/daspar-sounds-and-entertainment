import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(projectRoot);
process.env.PAGES_BASE_PATH = "/daspar-sounds-and-entertainment/";

await import("./render-catalogue.mjs");
await build({ configFile: path.resolve(projectRoot, "vite.config.js") });

console.log("Prepared GitHub Pages output at dist/public.");
