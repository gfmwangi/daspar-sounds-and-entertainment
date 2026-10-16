import express from "express";
import { db } from "../db/database.js";
import { contactLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * GET /api/public/products
 * Fetch products list with optional category filter and search query.
 */
router.get("/products", (req, res) => {
  try {
    const { category, q } = req.query;
    const products = db.getProducts({ category, q });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve products", details: error.message });
  }
});

/**
 * GET /api/public/products/:id
 * Fetch a single product by its unique identifier.
 */
router.get("/products/:id", (req, res) => {
  try {
    const product = db.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve product", details: error.message });
  }
});

/**
 * GET /api/public/categories
 * Fetch the confirmed product categories list.
 */
router.get("/categories", (req, res) => {
  try {
    const categories = db.getCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve categories", details: error.message });
  }
});

/**
 * POST /api/contact-inquiries
 * Submit a customer inquiry with server-side validation and rate limiting.
 */
router.post("/contact-inquiries", contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Full name is required." });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ error: "Subject is required." });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message content is required." });
    }

    const saved = await db.addContactInquiry({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Thank you for contacting DASPAR Sounds & Entertainment. Your inquiry has been received.",
      inquiryId: saved.id,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit inquiry", details: error.message });
  }
});

export default router;
