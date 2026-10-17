import express from "express";
import { Resend } from "resend";
import { db } from "../db/database.js";
import { config } from "../config.js";
import { contactLimiter } from "../middleware/rateLimiter.js";
import { requireTrustedOrigin } from "../security/session.js";

const router = express.Router();

router.get("/products", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.slice(0, 80) : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
  try {
    return res.json(await db.getProducts({ category, q }));
  } catch {
    return res.status(503).json({ error: "The product catalogue is temporarily unavailable." });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const product = await db.getProductById(req.params.id);
    return product ? res.json(product) : res.status(404).json({ error: "Product not found." });
  } catch {
    return res.status(503).json({ error: "Product details are temporarily unavailable." });
  }
});

router.get("/categories", async (req, res) => {
  try {
    return res.json(await db.getCategories());
  } catch {
    return res.status(503).json({ error: "Product categories are temporarily unavailable." });
  }
});

router.post("/contact-inquiries", requireTrustedOrigin, contactLimiter, async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  const clean = {
    name: typeof name === "string" ? name.trim() : "",
    email: typeof email === "string" ? email.trim() : "",
    subject: typeof subject === "string" ? subject.trim() : "",
    message: typeof message === "string" ? message.trim() : "",
  };
  if (!clean.name || clean.name.length > 120) return res.status(400).json({ error: "Enter a name of 1 to 120 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email) || clean.email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (!clean.subject || clean.subject.length > 160) return res.status(400).json({ error: "Enter a subject of 1 to 160 characters." });
  if (!clean.message || clean.message.length > 10_000) return res.status(400).json({ error: "Enter a message of 1 to 10,000 characters." });

  try {
    const inquiry = await db.addContactInquiry(clean);
    const emailConfigured = Boolean(config.resendApiKey && config.emailFrom && config.contactRecipientEmail);
    let notificationAccepted = false;
    if (emailConfigured) {
      try {
        const resend = new Resend(config.resendApiKey);
        const { error } = await resend.emails.send({
          from: config.emailFrom,
          to: [config.contactRecipientEmail],
          replyTo: clean.email,
          subject: `Website inquiry: ${clean.subject}`,
          text: `Name: ${clean.name}\nEmail: ${clean.email}\nSubject: ${clean.subject}\n\n${clean.message}`,
        });
        notificationAccepted = !error;
      } catch {
        notificationAccepted = false;
      }
    }
    const responseMessage = notificationAccepted
      ? "Thank you. Your inquiry was saved. DASPAR's email service accepted a notification request; delivery to the inbox is not confirmed."
      : emailConfigured
        ? "Thank you. Your inquiry was saved, but the email service did not confirm its notification request. For an urgent response, please contact us by WhatsApp or phone."
        : "Thank you. Your inquiry was saved, but no email was sent to DASPAR. For an urgent response, please contact us by WhatsApp or phone.";
    return res.status(201).json({ success: true, message: responseMessage, inquiryId: inquiry.id, emailNotificationAccepted: notificationAccepted });
  } catch {
    return res.status(503).json({ error: "Your inquiry could not be saved. Please contact DASPAR by WhatsApp or phone instead." });
  }
});

export default router;
