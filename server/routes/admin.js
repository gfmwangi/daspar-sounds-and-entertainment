import express from "express";
import { db } from "../db/database.js";
import { config } from "../config.js";
import { verifyPassword } from "../services/authService.js";
import { requireAdmin } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { uploadProductImages } from "../middleware/upload.js";

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  next();
});

const COOKIE_NAME = "daspar_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: "/",
};
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  path: "/",
};

function validateProductPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid product data." };
  const allowed = new Set(["name", "categoryId", "description", "specifications", "availability", "images"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return { error: "Unsupported product field." };
  const value = {};

  if (!partial || Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) return { error: "Product name must be 1–120 characters." };
    value.name = body.name.trim();
  }
  if (!partial || Object.hasOwn(body, "categoryId")) {
    if (typeof body.categoryId !== "string" || !body.categoryId.trim() || body.categoryId.length > 80) return { error: "A valid product category is required." };
    value.categoryId = body.categoryId.trim();
  }
  if (Object.hasOwn(body, "description")) {
    if (typeof body.description !== "string" || body.description.length > 5000) return { error: "Product description must be 5,000 characters or fewer." };
    value.description = body.description.trim();
  }
  if (Object.hasOwn(body, "specifications")) {
    if (!Array.isArray(body.specifications) || body.specifications.length > 40) return { error: "Specifications must be an array with no more than 40 entries." };
    const valid = body.specifications.every((item) => item && typeof item === "object" && !Array.isArray(item) &&
      typeof item.label === "string" && item.label.trim() && item.label.length <= 120 &&
      typeof item.value === "string" && item.value.trim() && item.value.length <= 500);
    if (!valid) return { error: "Each specification needs a label (up to 120 characters) and value (up to 500 characters)." };
    value.specifications = body.specifications.map(({ label, value: specValue }) => ({ label: label.trim(), value: specValue.trim() }));
  }
  if (Object.hasOwn(body, "availability")) {
    if (!["in_stock", "out_of_stock", "pending"].includes(body.availability)) return { error: "Invalid availability value." };
    value.availability = body.availability;
  }
  if (Object.hasOwn(body, "images")) {
    if (!Array.isArray(body.images) || body.images.length !== 0) return { error: "Attach images through the authenticated image-upload endpoint." };
    value.images = [];
  }
  if (partial && Object.keys(value).length === 0) return { error: "Provide at least one supported field to update." };
  return { value };
}

/**
 * POST /api/admin/session
 * Authenticate disposable local credentials and create a local test session.
 */
router.post("/session", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password || email.length > 254 || password.length > 512) {
      return res.status(400).json({ error: "Email address and password are required." });
    }

    const admin = db.getAdminByEmail(email.trim());
    if (!admin) {
      return res.status(401).json({ error: "Invalid email address or password." });
    }

    const isMatch = verifyPassword(password, admin.salt, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email address or password." });
    }

    const session = await db.createSession(admin.email);
    res.cookie(COOKIE_NAME, session.token, COOKIE_OPTIONS);

    await db.logAudit({
      adminEmail: admin.email,
      action: "ADMIN_LOGIN",
      details: "Successful administrator login",
    });

    res.json({
      authenticated: true,
      user: { email: admin.email, role: admin.role },
    });
  } catch (error) {
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * GET /api/admin/session
 * Return the current authenticated administrator and session status.
 */
router.get("/session", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.json({ authenticated: false });
  }

  const session = db.getSession(token);
  if (!session) {
    res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: { email: session.adminEmail },
  });
});

/**
 * DELETE /api/admin/session
 * Sign out and invalidate the current session.
 */
router.delete("/session", async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      await db.deleteSession(token);
    }
    res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
    res.json({ success: true, message: "Signed out successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to sign out", details: error.message });
  }
});

/**
 * GET /api/admin/stats
 * Return metrics for the local review datastore.
 */
router.get("/stats", requireAdmin, (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve statistics", details: error.message });
  }
});

/**
 * GET /api/admin/products
 * Fetch products list for the administrator dashboard.
 */
router.get("/products", requireAdmin, (req, res) => {
  try {
    const { category, q } = req.query;
    const products = db.getProducts({ category, q });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve products", details: error.message });
  }
});

/**
 * POST /api/admin/products
 * Create a product in the local JSON review store.
 */
router.post("/products", requireAdmin, async (req, res) => {
  try {
    const { error, value } = validateProductPayload(req.body);
    if (error) return res.status(400).json({ error });
    if (!db.getCategoryById(value.categoryId)) return res.status(400).json({ error: "Product category not found." });

    const newProduct = await db.createProduct(value);

    await db.logAudit({
      adminEmail: req.adminEmail,
      action: "CREATE_PRODUCT",
      productId: newProduct.id,
      details: `Created product: "${newProduct.name}" in category "${newProduct.categoryLabel}"`,
    });

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ error: "Failed to create product", details: error.message });
  }
});

/**
 * PATCH /api/admin/products/:id
 * Update an existing product's details or availability.
 */
router.patch("/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = validateProductPayload(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    if (value.categoryId && !db.getCategoryById(value.categoryId)) return res.status(400).json({ error: "Product category not found." });

    const updated = await db.updateProduct(id, value);
    if (!updated) {
      return res.status(404).json({ error: "Product not found" });
    }

    await db.logAudit({
      adminEmail: req.adminEmail,
      action: "UPDATE_PRODUCT",
      productId: id,
      details: `Updated product: "${updated.name}"`,
    });

    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: "Failed to update product", details: error.message });
  }
});

/**
 * DELETE /api/admin/products/:id
 * Delete a product from the local JSON review store.
 */
router.delete("/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const product = db.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const success = await db.deleteProduct(id);
    if (!success) {
      return res.status(500).json({ error: "Failed to delete product." });
    }

    await db.logAudit({
      adminEmail: req.adminEmail,
      action: "DELETE_PRODUCT",
      productId: id,
      details: `Deleted product: "${product.name}"`,
    });

    res.json({ success: true, deletedId: id, name: product.name });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product", details: error.message });
  }
});

/**
 * POST /api/admin/products/:id/images
 * Upload images and attach them to a product record.
 */
router.post(
  "/products/:id/images",
  requireAdmin,
  (req, res, next) => {
    if (!db.getProductById(req.params.id)) return res.status(404).json({ error: "Product not found" });
    next();
  },
  (req, res, next) => {
    uploadProductImages.array("photos", 10)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: "Upload error", details: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { id } = req.params;
      const product = db.getProductById(id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const files = req.files || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No image files were uploaded." });
      }

      const newFilenames = files.map((f) => f.filename);
      for (const fname of newFilenames) {
        await db.addProductImage(id, fname);
      }

      const updated = db.getProductById(id);

      await db.logAudit({
        adminEmail: req.adminEmail,
        action: "UPLOAD_IMAGES",
        productId: id,
        details: `Uploaded ${files.length} image(s): ${newFilenames.join(", ")}`,
      });

      res.json({
        success: true,
        product: updated,
        uploadedImages: newFilenames,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process image upload", details: error.message });
    }
  }
);

/**
 * GET /api/admin/inquiries
 * Retrieve received customer contact submissions.
 */
router.get("/inquiries", requireAdmin, (req, res) => {
  try {
    const inquiries = db.getContactInquiries();
    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve inquiries", details: error.message });
  }
});

/**
 * GET /api/admin/audit-logs
 * Retrieve system audit history for compliance and inspection.
 */
router.get("/audit-logs", requireAdmin, (req, res) => {
  try {
    const logs = db.getAuditLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve audit logs", details: error.message });
  }
});

export default router;
