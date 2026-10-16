import express from "express";
import { db } from "../db/database.js";
import { config } from "../config.js";
import { verifyPassword } from "../services/authService.js";
import { requireAdmin } from "../middleware/auth.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { uploadProductImages } from "../middleware/upload.js";

const router = express.Router();

const COOKIE_NAME = "daspar_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: "/",
};

/**
 * POST /api/admin/session
 * Authenticate administrator credentials and create a secure session.
 */
router.post("/session", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email address and password are required." });
    }

    const admin = db.getAdminByEmail(email);
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
      token: session.token,
    });
  } catch (error) {
    res.status(500).json({ error: "Authentication failed", details: error.message });
  }
});

/**
 * GET /api/admin/session
 * Return the current authenticated administrator and session status.
 */
router.get("/session", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.json({ authenticated: false });
  }

  const session = db.getSession(token);
  if (!session) {
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
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
    const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token) {
      await db.deleteSession(token);
    }
    res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    res.json({ success: true, message: "Signed out successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to sign out", details: error.message });
  }
});

/**
 * GET /api/admin/stats
 * Return live catalogue metrics for the dashboard.
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
 * Create a new product in the persistent catalogue.
 */
router.post("/products", requireAdmin, async (req, res) => {
  try {
    const { name, categoryId, description, specifications, images, availability } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Product name is required." });
    }

    if (!categoryId || typeof categoryId !== "string" || !categoryId.trim()) {
      return res.status(400).json({ error: "Product category is required." });
    }

    const newProduct = await db.createProduct({
      name,
      categoryId,
      description,
      specifications,
      images,
      availability,
    });

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
    const updates = req.body || {};

    const updated = await db.updateProduct(id, updates);
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
 * Delete a product from the persistent catalogue.
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
