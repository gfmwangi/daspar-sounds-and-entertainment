import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";

const temporaryUploadDir = path.join(os.tmpdir(), "daspar-product-upload-tmp");
fs.mkdirSync(temporaryUploadDir, { recursive: true, mode: 0o700 });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, temporaryUploadDir),
  filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`),
});

const fileFilter = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const validExtension = /^\.(jpe?g|png|webp|avif)$/.test(extension);
  const validMime = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(file.mimetype);
  if (!validExtension || !validMime) return callback(new Error("Unsupported image type."));
  callback(null, true);
};

export const uploadProductImages = multer({
  storage,
  limits: {
    fileSize: config.uploadMaxBytes,
    files: config.uploadMaxFiles,
    fields: 10,
    parts: config.uploadMaxFiles + 10,
  },
  fileFilter,
});

export { temporaryUploadDir };
