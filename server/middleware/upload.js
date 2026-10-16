import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { config } from "../config.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.productAssetsDir)) {
      fs.mkdirSync(config.productAssetsDir, { recursive: true });
    }
    cb(null, config.productAssetsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim();
    const safeName = `${cleanBase || "product-image"}_${Date.now()}${ext || ".jpeg"}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = /^\.(jpe?g|png|webp|avif)$/i;
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.test(ext) && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (.jpeg, .jpg, .png, .webp, .avif) are allowed."));
  }
};

export const uploadProductImages = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter,
});
