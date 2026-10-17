import crypto from "node:crypto";
import fs from "node:fs/promises";
import express from "express";
import { v2 as cloudinary } from "cloudinary";
import { Resend } from "resend";
import { fileTypeFromFile } from "file-type";
import { db } from "../db/database.js";
import { config } from "../config.js";
import { verifyPassword } from "../services/authService.js";
import { requireAdmin, requireTrustedOrigin, COOKIE_NAME, sessionCookieOptions, clearSessionCookie } from "../security/session.js";
import { loginLimiter, recoveryLimiter, setupLimiter } from "../middleware/rateLimiter.js";
import { uploadProductImages } from "../middleware/upload.js";

const router = express.Router();
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function validEmail(value) {
  return typeof value === "string" && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

router.get("/setup/status", async (_req, res) => {
  try {
    return res.json(await db.getSetupStatus());
  } catch {
    return res.status(503).json({ error: "Administrator setup status is temporarily unavailable." });
  }
});

router.post("/setup", requireTrustedOrigin, setupLimiter, async (req, res) => {
  const { email, password, confirmPassword } = req.body || {};
  if (!validEmail(email) || typeof password !== "string" || password.length < 12 || password.length > 128 || password !== confirmPassword) {
    return res.status(400).json({ error: "Enter a valid email and matching passwords between 12 and 128 characters." });
  }
  try {
    if ((await db.getSetupStatus()).setupComplete) return res.status(409).json({ error: "Administrator setup is already complete. Sign in instead." });
    const admin = await db.createInitialAdmin({ email, password });
    const session = await db.createSession(admin.id);
    res.cookie(COOKIE_NAME, session.token, sessionCookieOptions());
    await writeAuditSafely({ adminId: admin.id, adminEmail: admin.email, action: "ADMIN_INITIAL_SETUP", details: "First administrator account created" });
    return res.status(201).json({
      setupComplete: true,
      user: { email: admin.email, role: admin.role },
      recoveryKey: admin.recoveryKey,
      message: "Administrator setup is complete. Save this emergency recovery key somewhere private; you can view it again in Account Settings.",
    });
  } catch (error) {
    if (error.message?.includes("permanently locked") || error.message?.includes("already exists")) {
      return res.status(409).json({ error: "Administrator setup is already complete. Sign in instead." });
    }
    return res.status(503).json({ error: "Administrator setup could not be completed. No account was created; please try again." });
  }
});

function validateProduct(input, { partial = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Product information is invalid.";
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) return "Product name must contain 1 to 120 characters.";
  }
  if (!partial || input.categoryId !== undefined) {
    if (typeof input.categoryId !== "string" || !input.categoryId.trim() || input.categoryId.length > 80) return "Choose a valid product category.";
  }
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 10_000)) return "Description must be 10,000 characters or fewer.";
  if (input.specifications !== undefined) {
    if (!Array.isArray(input.specifications) || input.specifications.length > 50) return "Provide no more than 50 product specifications.";
    for (const spec of input.specifications) {
      if (!spec || typeof spec.label !== "string" || typeof spec.value !== "string" || spec.label.length > 120 || spec.value.length > 500) {
        return "Each specification needs a label and a value within the allowed length.";
      }
    }
  } else if (!partial) {
    input.specifications = [];
  }
  if (input.availability !== undefined && !["in_stock", "out_of_stock", "pending"].includes(input.availability)) return "Choose a valid availability status.";
  if (input.images !== undefined && (!Array.isArray(input.images) || input.images.length > 100 || input.images.some((item) => typeof item !== "string" || item.length > 2048))) {
    return "Product image references are invalid.";
  }
  return null;
}

function getCloudinary() {
  if (!config.cloudinaryUrl) return null;
  let url;
  try {
    url = new URL(config.cloudinaryUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "cloudinary:" || !url.hostname || !url.username || !url.password) return null;
  cloudinary.config({
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true,
  });
  return cloudinary;
}

async function writeAuditSafely(event) {
  try {
    await db.logAudit(event);
  } catch (error) {
    console.error(`[audit:${event.action}] record could not be written (${error.name || "Error"})`);
  }
}

async function retryPendingCloudinaryDeletions(client, { prioritize = [], limit = 500 } = {}) {
  const pending = await db.getPendingCloudinaryImageDeletions(limit);
  const publicIds = [...new Set([...prioritize, ...pending.map((item) => item.providerPublicId)])];
  const results = await Promise.allSettled(publicIds.map(async (publicId) => {
    try {
      const result = await client.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
      if (!["ok", "not found"].includes(result?.result)) throw new Error("Provider did not confirm image deletion.");
      await db.completeCloudinaryImageDeletion(publicId);
      return true;
    } catch {
      await db.recordCloudinaryImageDeletionFailure(publicId).catch(() => {});
      return false;
    }
  }));
  const failedCount = results.filter((result) => result.status === "rejected" || result.value === false).length;
  return { attempted: publicIds.length, failedCount, pendingCount: await db.countPendingCloudinaryImageDeletions() };
}

async function removeCloudinaryUploads(client, uploads) {
  const publicIds = uploads.map((item) => item.public_id).filter((id) => typeof id === "string" && id.length > 0);
  let queuePersisted = true;
  try {
    await db.queueCloudinaryImageDeletions(publicIds);
  } catch {
    queuePersisted = false;
  }
  if (queuePersisted) {
    try {
      return await retryPendingCloudinaryDeletions(client, { prioritize: publicIds });
    } catch {
      const directResults = await Promise.allSettled(publicIds.map((publicId) => client.uploader.destroy(publicId, { resource_type: "image", invalidate: true })));
      const failedCount = directResults.filter((result) => result.status === "rejected" || !["ok", "not found"].includes(result.value?.result)).length;
      return { attempted: publicIds.length, failedCount, pendingCount: await db.countPendingCloudinaryImageDeletions().catch(() => publicIds.length) };
    }
  }

  const results = await Promise.allSettled(publicIds.map((publicId) => client.uploader.destroy(publicId, { resource_type: "image", invalidate: true })));
  const failedCount = results.filter((result) => result.status === "rejected" || !["ok", "not found"].includes(result.value?.result)).length;
  if (failedCount) console.error(`[image-cleanup] provider did not confirm deletion for ${failedCount} temporary image(s); queue persistence was unavailable`);
  return { attempted: publicIds.length, failedCount, pendingCount: await db.countPendingCloudinaryImageDeletions().catch(() => 0), queuePersistenceFailed: true };
}

router.post("/session", requireTrustedOrigin, loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== "string" || password.length > 128) {
      return res.status(401).json({ error: "Invalid email address or password." });
    }
    const admin = await db.getAdminByEmail(email);
    if (!admin || !verifyPassword(password, admin.salt, admin.passwordHash)) {
      return res.status(401).json({ error: "Invalid email address or password." });
    }
    const session = await db.createSession(admin.id);
    res.cookie(COOKIE_NAME, session.token, sessionCookieOptions());
    await writeAuditSafely({ adminId: admin.id, adminEmail: admin.email, action: "ADMIN_LOGIN", details: "Successful administrator sign-in" });
    return res.json({ authenticated: true, user: { email: admin.email, role: admin.role } });
  } catch {
    return res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again shortly." });
  }
});

router.get("/session", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });
  try {
    const session = await db.getSession(token);
    if (!session) {
      clearSessionCookie(res);
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, user: { email: session.adminEmail, role: session.role } });
  } catch {
    return res.status(503).json({ error: "Session status is temporarily unavailable." });
  }
});

router.delete("/session", requireTrustedOrigin, async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) await db.deleteSession(token);
    clearSessionCookie(res);
    return res.json({ success: true, message: "Signed out." });
  } catch {
    clearSessionCookie(res);
    return res.status(503).json({ error: "Sign-out could not be confirmed. Please close this browser session." });
  }
});

router.post("/password-reset/request", requireTrustedOrigin, recoveryLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (!config.resendApiKey || !config.emailFrom || !config.publicOrigin) {
    return res.status(503).json({ error: "Password recovery is not enabled yet. No reset email was sent and no password was changed." });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  try {
    const admin = await db.createPasswordResetToken(email, token, 30);
    if (admin) {
      const resetUrl = new URL("/admin/reset-password.html", config.publicOrigin);
      resetUrl.searchParams.set("token", token);
      const resend = new Resend(config.resendApiKey);
      const { error } = await resend.emails.send({
        from: config.emailFrom,
        to: [admin.email],
        subject: "Reset your DASPAR administrator password",
        text: `A password reset was requested for the DASPAR administrator account. Use this one-time link within 30 minutes: ${resetUrl.toString()}\n\nIf you did not request this reset, ignore this message. Your password has not changed.`,
      });
      if (error) {
        await db.deletePasswordResetToken(token).catch(() => {});
        return res.status(503).json({ error: "The recovery email could not be sent. No password was changed; contact the business owner." });
      }
    }
    return res.status(202).json({ message: "If that address belongs to the administrator and the email provider accepts the request, reset instructions may be delivered. Inbox delivery is not confirmed. The password changes only after the one-time link is used." });
  } catch {
    await db.deletePasswordResetToken(token).catch(() => {});
    return res.status(503).json({ error: "Password recovery is temporarily unavailable. No password was changed." });
  }
});

router.post("/password-reset/complete", requireTrustedOrigin, recoveryLimiter, async (req, res) => {
  const { token, password, confirmPassword } = req.body || {};
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return res.status(400).json({ error: "This reset link is invalid or has expired." });
  if (typeof password !== "string" || password.length < 12 || password.length > 128) return res.status(400).json({ error: "Use a password between 12 and 128 characters." });
  if (password !== confirmPassword) return res.status(400).json({ error: "The passwords do not match." });
  try {
    const updated = await db.consumePasswordReset(token, password);
    if (!updated) return res.status(400).json({ error: "This reset link is invalid, expired, or has already been used." });
    return res.json({ success: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    if (error.message?.includes("password must")) return res.status(400).json({ error: error.message });
    return res.status(503).json({ error: "The password could not be updated. Please try again." });
  }
});

router.post("/recovery-key/reset", requireTrustedOrigin, recoveryLimiter, async (req, res) => {
  const { email, recoveryKey, password, confirmPassword } = req.body || {};
  if (!validEmail(email) || typeof recoveryKey !== "string" || typeof password !== "string" || password !== confirmPassword || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: "Enter your administrator email, recovery key, and matching new passwords between 12 and 128 characters." });
  }
  try {
    const result = await db.resetAdminPasswordWithRecoveryKey({ email, recoveryKey, password });
    if (!result) return res.status(401).json({ error: "The recovery details could not be verified. Check them and try again." });
    await writeAuditSafely({ adminEmail: result.email, action: "ADMIN_PASSWORD_RECOVERED", details: "Password reset with emergency recovery key; recovery key rotated" });
    clearSessionCookie(res);
    return res.json({
      success: true,
      recoveryKey: result.recoveryKey,
      message: "Password changed and all previous sessions signed out. Save your replacement recovery key now; you can also view it after signing in.",
    });
  } catch (error) {
    if (error.message?.includes("password must")) return res.status(400).json({ error: "Use a new password between 12 and 128 characters." });
    return res.status(503).json({ error: "Emergency password recovery is temporarily unavailable. No password change was confirmed." });
  }
});

router.get("/account", requireAdmin, async (req, res) => {
  try {
    const account = await db.getAdminById(req.adminId);
    if (!account) return res.status(401).json({ error: "Administrator account no longer exists." });
    return res.json({ email: account.email, role: account.role, recoveryKey: null });
  } catch {
    return res.status(503).json({ error: "Account details are temporarily unavailable." });
  }
});

router.post("/account/recovery-key/view", requireTrustedOrigin, requireAdmin, recoveryLimiter, async (req, res) => {
  const { currentPassword } = req.body || {};
  if (typeof currentPassword !== "string" || currentPassword.length > 128) {
    return res.status(400).json({ error: "Enter your current password to view the recovery key." });
  }
  try {
    const admin = await db.getAdminByEmail(req.adminEmail);
    if (!admin || !verifyPassword(currentPassword, admin.salt, admin.passwordHash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const recoveryKey = await db.getRecoveryKeyForAdmin(req.adminId);
    if (!recoveryKey) return res.status(503).json({ error: "The recovery key is unavailable. Rotate it after confirming your account settings." });
    return res.json({ recoveryKey, message: "Password verified. Keep this recovery key private." });
  } catch {
    return res.status(503).json({ error: "The recovery key could not be verified or retrieved." });
  }
});

router.post("/account/recovery-key/rotate", requireTrustedOrigin, requireAdmin, async (req, res) => {
  const { currentPassword } = req.body || {};
  if (typeof currentPassword !== "string" || currentPassword.length > 128) return res.status(400).json({ error: "Enter your current password to rotate the recovery key." });
  try {
    const recoveryKey = await db.rotateRecoveryKey(req.adminId, currentPassword);
    if (!recoveryKey) return res.status(401).json({ error: "Current password is incorrect." });
    await writeAuditSafely({ adminId: req.adminId, adminEmail: req.adminEmail, action: "ADMIN_RECOVERY_KEY_ROTATED" });
    return res.json({ recoveryKey, message: "Recovery key rotated. The previous key no longer works; save this new key privately." });
  } catch {
    return res.status(503).json({ error: "The recovery key could not be rotated." });
  }
});

router.patch("/account/email", requireTrustedOrigin, requireAdmin, async (req, res) => {
  const { email, currentPassword } = req.body || {};
  if (!validEmail(email) || typeof currentPassword !== "string") return res.status(400).json({ error: "A valid email and current password are required." });
  try {
    const account = await db.getAdminByEmail(req.adminEmail);
    if (!account || !verifyPassword(currentPassword, account.salt, account.passwordHash)) return res.status(401).json({ error: "Current password is incorrect." });
    const updated = await db.updateAdminEmail(req.adminId, email);
    if (!updated) return res.status(401).json({ error: "Administrator account no longer exists." });
    await writeAuditSafely({ adminId: req.adminId, adminEmail: updated.email, action: "ADMIN_EMAIL_CHANGED" });
    clearSessionCookie(res);
    return res.json({ success: true, message: "Email updated. Sign in again using the new address." });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That email address is already used by an administrator." });
    return res.status(503).json({ error: "The email address could not be updated." });
  }
});

router.post("/account/password", requireTrustedOrigin, requireAdmin, async (req, res) => {
  const { currentPassword, password, confirmPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof password !== "string" || password !== confirmPassword) {
    return res.status(400).json({ error: "Enter the current password and matching new passwords." });
  }
  try {
    const updated = await db.changeAdminPassword(req.adminId, currentPassword, password);
    if (!updated) return res.status(401).json({ error: "Current password is incorrect." });
    await writeAuditSafely({ adminId: req.adminId, adminEmail: req.adminEmail, action: "ADMIN_PASSWORD_CHANGED" });
    clearSessionCookie(res);
    return res.json({ success: true, message: "Password updated. Sign in again with the new password." });
  } catch (error) {
    if (error.message?.includes("password must")) return res.status(400).json({ error: error.message });
    return res.status(503).json({ error: "The password could not be updated." });
  }
});

router.get("/stats", requireAdmin, async (req, res) => {
  try {
    return res.json(await db.getStats());
  } catch {
    return res.status(503).json({ error: "Dashboard statistics are temporarily unavailable." });
  }
});

router.get("/inquiries", requireAdmin, async (req, res) => {
  const parsedLimit = Number.parseInt(String(req.query.limit || "100"), 10);
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 200)) : 100;
  try {
    return res.json(await db.getContactInquiries({ limit }));
  } catch {
    return res.status(503).json({ error: "Customer inquiries are temporarily unavailable." });
  }
});

router.get("/products", requireAdmin, async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.slice(0, 80) : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
  try {
    return res.json(await db.getProducts({ category, q }));
  } catch {
    return res.status(503).json({ error: "Products are temporarily unavailable." });
  }
});

router.post("/products", requireTrustedOrigin, requireAdmin, async (req, res) => {
  const input = { ...req.body };
  delete input.images;
  const validationError = validateProduct(input);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const product = await db.createProduct({ ...input, images: [] });
    await writeAuditSafely({ adminId: req.adminId, adminEmail: req.adminEmail, action: "CREATE_PRODUCT", productId: product.id, details: `Created product: ${product.name}` });
    return res.status(201).json(product);
  } catch {
    return res.status(400).json({ error: "The product could not be created. Check its name and category." });
  }
});

router.patch("/products/:id", requireTrustedOrigin, requireAdmin, async (req, res) => {
  const allowed = new Set(["name", "categoryId", "description", "specifications", "availability"]);
  const updates = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (Object.keys(updates).length === 0 || Object.keys(updates).some((key) => !allowed.has(key))) return res.status(400).json({ error: "Only product details and availability can be updated here." });
  const validationError = validateProduct(updates, { partial: true });
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const product = await db.updateProduct(req.params.id, updates);
    if (!product) return res.status(404).json({ error: "Product not found." });
    await writeAuditSafely({ adminId: req.adminId, adminEmail: req.adminEmail, action: "UPDATE_PRODUCT", productId: product.id, details: `Updated product: ${product.name}` });
    return res.json(product);
  } catch {
    return res.status(400).json({ error: "The product could not be updated. Check its details and category." });
  }
});

router.delete("/products/:id", requireTrustedOrigin, requireAdmin, async (req, res) => {
  try {
    const product = await db.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    const deleted = await db.deleteProductAndQueueImageCleanup(product.id);
    if (!deleted) return res.status(404).json({ error: "Product not found." });
    await writeAuditSafely({ adminId: req.adminId, adminEmail: req.adminEmail, action: "DELETE_PRODUCT", productId: product.id, details: `Deleted product: ${product.name}` });
    let imageCleanupPending = deleted.queuedImageCount > 0;
    try {
      const cloudinaryClient = getCloudinary();
      if (cloudinaryClient) await retryPendingCloudinaryDeletions(cloudinaryClient);
      imageCleanupPending = (await db.countPendingCloudinaryImageDeletions()) > 0;
    } catch {
      imageCleanupPending = true;
    }
    return res.json({ success: true, deletedId: product.id, name: product.name, imageCleanupPending });
  } catch {
    return res.status(503).json({ error: "The product could not be deleted." });
  }
});

router.post("/products/:id/images", requireTrustedOrigin, requireAdmin, async (req, res, next) => {
  const cloudinaryClient = getCloudinary();
  if (!cloudinaryClient) return res.status(503).json({ error: "Product image uploads are not enabled. No images were stored." });
  try {
    if (!await db.getProductById(req.params.id)) return res.status(404).json({ error: "Product not found." });
    if (await db.countPendingCloudinaryImageDeletions()) await retryPendingCloudinaryDeletions(cloudinaryClient);
  } catch {
    return res.status(503).json({ error: "Product data or image cleanup status is temporarily unavailable." });
  }
  uploadProductImages.array("photos", config.uploadMaxFiles)(req, res, (error) => {
    if (error) return res.status(400).json({ error: "Image upload rejected. Choose up to 10 supported images, each no larger than 10 MB." });
    next();
  });
}, async (req, res) => {
  const client = getCloudinary();
  if (!client) return res.status(503).json({ error: "Image storage is unavailable." });
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: "Select at least one image." });
  const uploaded = [];
  try {
    for (const file of files) {
      const detected = await fileTypeFromFile(file.path);
      if (!detected || !allowedImageTypes.has(detected.mime)) {
        return res.status(400).json({ error: "One or more files are not valid JPEG, PNG, WebP, or AVIF images. No images were uploaded or attached." });
      }
    }

    const uploadPlans = files.map((file) => ({ file, publicId: `daspar/products/${crypto.randomUUID()}` }));
    let reservedCount;
    try {
      reservedCount = await db.queueCloudinaryImageDeletions(uploadPlans.map((plan) => plan.publicId));
    } catch {
      return res.status(503).json({ error: "Image upload was not attempted because cleanup tracking is unavailable." });
    }
    if (reservedCount !== uploadPlans.length) {
      return res.status(503).json({ error: "Image upload was not attempted because a unique cleanup identifier could not be reserved." });
    }

    for (const plan of uploadPlans) {
      const result = await client.uploader.upload(plan.file.path, {
        public_id: plan.publicId, resource_type: "image", unique_filename: false, overwrite: false,
      });
      if (result.public_id !== plan.publicId) {
        if (typeof result.public_id === "string" && result.public_id.length > 0) {
          await db.queueCloudinaryImageDeletions([result.public_id]).catch(() => {});
          uploaded.push({ public_id: result.public_id, secure_url: result.secure_url, format: result.format });
        }
        throw new Error("The image provider returned an unexpected asset identifier.");
      }
      uploaded.push({ public_id: result.public_id, secure_url: result.secure_url, format: result.format });
    }
    const product = await db.addProductImages(req.params.id, uploaded.map((item) => ({ assetUrl: item.secure_url, providerPublicId: item.public_id })));
    if (!product) {
      const cleanup = await removeCloudinaryUploads(client, uploaded);
      return res.status(404).json({ error: cleanup.failedCount
        ? "Product not found. No images were attached; some temporary provider files may need cleanup."
        : "Product not found. Uploaded images were removed." });
    }
    await writeAuditSafely({ adminId: req.adminId, adminEmail: req.adminEmail, action: "UPLOAD_IMAGES", productId: product.id, details: `Uploaded ${uploaded.length} validated product image(s)` });
    return res.json({ success: true, product, uploadedImages: uploaded.map((item) => item.secure_url) });
  } catch {
    const cleanup = await removeCloudinaryUploads(client, uploaded);
    return res.status(503).json({ error: cleanup.failedCount
      ? "The images could not be saved. No images were attached to the product; some temporary provider files may need cleanup."
      : "The images could not be saved. Any incomplete upload was removed." });
  } finally {
    await Promise.allSettled(files.map((file) => fs.unlink(file.path)));
  }
});

router.get("/audit-logs", requireAdmin, async (req, res) => {
  try {
    return res.json(await db.getAuditLogs());
  } catch {
    return res.status(503).json({ error: "Audit history is temporarily unavailable." });
  }
});

export default router;
