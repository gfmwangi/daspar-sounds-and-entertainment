import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config.js";
import { hashPassword, generateSalt, generateSessionToken } from "../services/authService.js";
import { PRODUCT_CATEGORIES as SEED_CATEGORIES, PRODUCTS as SEED_PRODUCTS } from "../../client/src/data/products.js";

const hashSessionToken = (token) => createHash("sha256").update(String(token)).digest("hex");

class Database {
  constructor() {
    this.filePath = config.databaseFile;
    this.data = {
      categories: [],
      products: [],
      admins: [],
      sessions: [],
      contactInquiries: [],
      auditLogs: [],
    };
    this.initialized = false;
    this.saveChain = Promise.resolve();
  }

  async init() {
    if (this.initialized) return;

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    let existingData = null;
    let shouldSave = false;
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      existingData = JSON.parse(content);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error("The local data file could not be read or parsed. Preserve it and inspect it before retrying.", { cause: error });
      }
    }

    if (existingData !== null && (typeof existingData !== "object" || Array.isArray(existingData))) {
      throw new Error("The local data file has an invalid top-level structure; it was not replaced.");
    }
    if (existingData && typeof existingData === "object") {
      for (const key of ["categories", "products", "admins", "sessions", "contactInquiries", "auditLogs"]) {
        if (existingData[key] !== undefined && !Array.isArray(existingData[key])) {
          throw new Error(`The local data file field '${key}' is invalid; it was not replaced.`);
        }
      }
      const sessions = (existingData.sessions || []).map((session) => {
        if (session && typeof session.token === "string" && !session.tokenHash) {
          const { token, ...safeSession } = session;
          shouldSave = true;
          return { ...safeSession, tokenHash: hashSessionToken(token) };
        }
        return session;
      });
      this.data = {
        categories: existingData.categories || [],
        products: existingData.products || [],
        admins: existingData.admins || [],
        sessions,
        contactInquiries: existingData.contactInquiries || [],
        auditLogs: existingData.auditLogs || [],
      };
    }

    // Seed categories if missing
    if (this.data.categories.length === 0) {
      this.data.categories = SEED_CATEGORIES.map((cat) => ({ ...cat }));
      shouldSave = true;
    }

    // Seed products if missing
    if (this.data.products.length === 0) {
      this.data.products = SEED_PRODUCTS.map((prod) => ({
        ...prod,
        specifications: prod.specifications ? [...prod.specifications] : [],
        images: prod.images ? [...prod.images] : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      shouldSave = true;
    }

    if (this.data.admins.length === 0) {
      const salt = generateSalt();
      const passwordHash = hashPassword(config.adminInitialPassword, salt);
      this.data.admins.push({
        id: randomUUID(),
        email: config.adminEmail,
        salt,
        passwordHash,
        role: "admin",
        createdAt: new Date().toISOString(),
      });
      shouldSave = true;
    }

    // Clean expired sessions on startup
    const now = Date.now();
    const initialSessionCount = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((s) => s.expiresAt > now);
    if (this.data.sessions.length !== initialSessionCount) {
      shouldSave = true;
    }

    if (shouldSave || !existingData) {
      await this.save();
    }

    this.initialized = true;
  }

  async save() {
    const serialized = JSON.stringify(this.data, null, 2);
    const writeSnapshot = async () => {
      const tempFile = `${this.filePath}.tmp.${process.pid}.${randomUUID()}`;
      try {
        await fs.writeFile(tempFile, serialized, { encoding: "utf-8", mode: 0o600, flag: "wx" });
        await fs.rename(tempFile, this.filePath);
      } finally {
        await fs.rm(tempFile, { force: true }).catch(() => {});
      }
    };
    this.saveChain = this.saveChain.then(writeSnapshot, writeSnapshot);
    await this.saveChain;
  }

  // Categories
  getCategories() {
    return [...this.data.categories];
  }

  getCategoryById(id) {
    return this.data.categories.find((c) => c.id === id) || null;
  }

  // Products
  getProducts({ category, q } = {}) {
    let result = this.data.products;

    if (category && category !== "all") {
      result = result.filter((p) => p.categoryId === category);
    }

    if (q) {
      const term = q.trim().toLowerCase();
      result = result.filter((p) => {
        const text = `${p.name} ${p.categoryLabel} ${p.description || ""} ${p.group || ""}`.toLowerCase();
        return text.includes(term);
      });
    }

    return [...result];
  }

  getProductById(id) {
    return this.data.products.find((p) => p.id === id) || null;
  }

  async createProduct({ name, categoryId, description = "", specifications = [], images = [], availability = "in_stock" }) {
    const category = this.getCategoryById(categoryId);
    if (!category) {
      throw new Error(`Invalid category ID: "${categoryId}"`);
    }

    // Slugify name for a readable ID, check collision
    let baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!baseId) baseId = `product-${Date.now()}`;
    let uniqueId = baseId;
    let counter = 1;
    while (this.data.products.some((p) => p.id === uniqueId)) {
      uniqueId = `${baseId}-${counter++}`;
    }

    const newProduct = {
      id: uniqueId,
      name: name.trim(),
      categoryId: category.id,
      categoryLabel: category.label,
      group: category.group,
      description: (description || "").trim(),
      specifications: Array.isArray(specifications) ? specifications : [],
      images: Array.isArray(images) ? images : [],
      availability: ["in_stock", "out_of_stock", "pending"].includes(availability) ? availability : "in_stock",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.data.products.unshift(newProduct);
    await this.save();
    return newProduct;
  }

  async updateProduct(id, updates) {
    const index = this.data.products.findIndex((p) => p.id === id);
    if (index === -1) {
      return null;
    }

    const current = this.data.products[index];
    const category = updates.categoryId ? this.getCategoryById(updates.categoryId) : this.getCategoryById(current.categoryId);

    const updated = {
      ...current,
      name: updates.name !== undefined ? updates.name.trim() : current.name,
      categoryId: category ? category.id : current.categoryId,
      categoryLabel: category ? category.label : current.categoryLabel,
      group: category ? category.group : current.group,
      description: updates.description !== undefined ? updates.description.trim() : current.description,
      specifications: updates.specifications !== undefined ? updates.specifications : current.specifications,
      images: updates.images !== undefined ? updates.images : current.images,
      availability: updates.availability !== undefined ? updates.availability : current.availability,
      updatedAt: new Date().toISOString(),
    };

    this.data.products[index] = updated;
    await this.save();
    return updated;
  }

  async deleteProduct(id) {
    const index = this.data.products.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }

    this.data.products.splice(index, 1);
    await this.save();
    return true;
  }

  async addProductImage(id, filename) {
    const product = this.getProductById(id);
    if (!product) return null;

    const imageUrl = `/uploads/products/${filename}`;
    if (!product.images.includes(imageUrl)) {
      product.images.push(imageUrl);
      product.updatedAt = new Date().toISOString();
      await this.save();
    }
    return product;
  }

  // Admin & Sessions
  getAdminByEmail(email) {
    const normalized = (email || "").trim().toLowerCase();
    return this.data.admins.find((a) => a.email.toLowerCase() === normalized) || null;
  }

  async createSession(adminEmail, ttlHours = 24) {
    const token = generateSessionToken();
    const expiresAt = Date.now() + ttlHours * 60 * 60 * 1000;
    const record = {
      tokenHash: hashSessionToken(token),
      adminEmail,
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    this.data.sessions.push(record);
    await this.save();
    return { token, adminEmail, createdAt: record.createdAt, expiresAt };
  }

  getSession(token) {
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    const session = this.data.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session) return null;

    if (session.expiresAt <= Date.now()) {
      this.deleteSession(token).catch(() => {});
      return null;
    }

    return session;
  }

  async deleteSession(token) {
    const tokenHash = hashSessionToken(token);
    const index = this.data.sessions.findIndex((s) => s.tokenHash === tokenHash);
    if (index !== -1) {
      this.data.sessions.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  // Contact inquiries
  async addContactInquiry({ name, email, subject, message }) {
    const inquiry = {
      id: `inquiry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: (name || "").trim(),
      email: (email || "").trim().toLowerCase(),
      subject: (subject || "").trim(),
      message: (message || "").trim(),
      createdAt: new Date().toISOString(),
    };

    this.data.contactInquiries.unshift(inquiry);
    await this.save();
    return inquiry;
  }

  getContactInquiries() {
    return [...this.data.contactInquiries];
  }

  // Audit logs
  async logAudit({ adminEmail, action, productId, details = "" }) {
    const log = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      adminEmail,
      action,
      productId: productId || null,
      details,
      timestamp: new Date().toISOString(),
    };

    this.data.auditLogs.unshift(log);
    // Keep last 1000 logs
    if (this.data.auditLogs.length > 1000) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 1000);
    }
    await this.save();
    return log;
  }

  getAuditLogs() {
    return [...this.data.auditLogs];
  }

  // Dashboard Statistics
  getStats() {
    const totalProducts = this.data.products.length;
    const inStock = this.data.products.filter((p) => p.availability === "in_stock").length;
    const allImages = new Set(this.data.products.flatMap((p) => p.images || []));
    return {
      totalProducts,
      inStock,
      totalPhotos: allImages.size,
    };
  }
}

export const db = new Database();
