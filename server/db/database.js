import crypto from "node:crypto";
import pg from "pg";
import { config } from "../config.js";
import { hashPassword, generateSalt, generateSessionToken, verifyPassword } from "../services/authService.js";
import { PRODUCT_CATEGORIES, PRODUCTS } from "../../client/src/data/products.js";
import { runMigrations } from "./migrate.js";

const { Pool } = pg;
const SEED_KEY = "catalog-source-2026-10";

const productColumns = `
  id, name, category_id AS "categoryId", category_label AS "categoryLabel",
  product_group AS "group", description, specifications, images, availability,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function hashToken(token) {
  return crypto.createHmac("sha256", config.sessionSecret).update(token, "utf8").digest("hex");
}

function normalizeRecoveryKey(value) {
  const key = String(value || "").trim().toUpperCase();
  return /^DASPAR-(?:[0-9A-F]{4}-){9}[0-9A-F]{4}$/.test(key) ? key : null;
}

function makeRecoveryKey() {
  const groups = crypto.randomBytes(20).toString("hex").toUpperCase().match(/.{4}/g);
  return `DASPAR-${groups.join("-")}`;
}

function recoveryEncryptionKey() {
  return crypto.createHash("sha256").update("daspar:recovery-key-encryption:v1\0", "utf8").update(config.sessionSecret, "utf8").digest();
}

function encryptRecoveryKey(key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", recoveryEncryptionKey(), iv);
  cipher.setAAD(Buffer.from("daspar-recovery-key-v1", "utf8"));
  const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptRecoveryKey(payload) {
  const [version, ivText, tagText, encryptedText] = String(payload || "").split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) throw new Error("The saved recovery key is unavailable. Rotate it from Account Settings.");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", recoveryEncryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAAD(Buffer.from("daspar-recovery-key-v1", "utf8"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The saved recovery key cannot be decrypted. Rotate it from Account Settings after signing in.");
  }
}

function matchesRecoveryKey(candidate, storedHash) {
  const normalized = normalizeRecoveryKey(candidate);
  if (!normalized || typeof storedHash !== "string") return false;
  const actual = Buffer.from(hashToken(normalized), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function mapDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapProduct(row) {
  if (!row) return null;
  return {
    ...row,
    createdAt: mapDate(row.createdAt),
    updatedAt: mapDate(row.updatedAt),
  };
}

function slugify(value) {
  const result = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return result || `product-${crypto.randomUUID()}`;
}

export class Database {
  constructor() {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "daspar-sounds-and-entertainment",
    });
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await this.pool.query("SELECT 1");
    await runMigrations(this.pool);
    await this.seedCatalog();
    this.initialized = true;
  }

  async close() {
    await this.pool.end();
    this.initialized = false;
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await callback(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async seedCatalog() {
    await this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["daspar:initial-catalog-seed"]);
      const seeded = await client.query("SELECT 1 FROM catalog_seed_runs WHERE seed_key = $1", [SEED_KEY]);
      if (seeded.rowCount > 0) return;

      for (const [index, category] of PRODUCT_CATEGORIES.entries()) {
        await client.query(
          `INSERT INTO categories(id, label, category_group, sort_order)
           VALUES($1, $2, $3, $4) ON CONFLICT(id) DO NOTHING`,
          [category.id, category.label, category.group, index],
        );
      }

      for (const product of PRODUCTS) {
        const category = PRODUCT_CATEGORIES.find((item) => item.id === product.categoryId);
        if (!category) throw new Error(`Catalogue seed references missing category: ${product.categoryId}`);
        await client.query(
          `INSERT INTO products(id, name, category_id, category_label, product_group, description,
             specifications, images, availability)
           VALUES($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
           ON CONFLICT(id) DO NOTHING`,
          [product.id, product.name, product.categoryId, category.label, category.group,
            product.description || "", JSON.stringify(product.specifications || []),
            JSON.stringify(product.images || []), product.availability || "in_stock"],
        );
      }

      await client.query(
        `INSERT INTO catalog_seed_runs(seed_key, product_count, category_count) VALUES($1, $2, $3)`,
        [SEED_KEY, PRODUCTS.length, PRODUCT_CATEGORIES.length],
      );
    });
  }

  async getCategories() {
    const result = await this.pool.query(
      `SELECT id, label, category_group AS "group" FROM categories ORDER BY sort_order, id`,
    );
    return result.rows;
  }

  async getCategoryById(id) {
    const result = await this.pool.query(
      `SELECT id, label, category_group AS "group" FROM categories WHERE id = $1`, [id],
    );
    return result.rows[0] || null;
  }

  async getProducts({ category, q } = {}) {
    const term = String(q || "").trim().replace(/[\\%_]/g, "\\$&");
    const result = await this.pool.query(
      `SELECT ${productColumns} FROM products
       WHERE ($1::text IS NULL OR $1 = 'all' OR category_id = $1)
         AND ($2::text = '' OR (name || ' ' || category_label || ' ' || description || ' ' || product_group) ILIKE '%' || $2 || '%' ESCAPE E'\\\\')
       ORDER BY created_at DESC, id`,
      [category || null, term],
    );
    return result.rows.map(mapProduct);
  }

  async getProductById(id, client = this.pool) {
    const result = await client.query(`SELECT ${productColumns} FROM products WHERE id = $1`, [id]);
    return mapProduct(result.rows[0]);
  }

  async createProduct({ name, categoryId, description = "", specifications = [], images = [], availability = "in_stock" }) {
    const category = await this.getCategoryById(categoryId);
    if (!category) throw new Error("Choose a valid product category.");
    const baseId = slugify(name);
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`daspar:product:${baseId}`]);
      for (let suffix = 0; suffix < 10_000; suffix += 1) {
        const id = suffix === 0 ? baseId : `${baseId}-${suffix}`;
        const result = await client.query(
          `INSERT INTO products(id, name, category_id, category_label, product_group, description,
             specifications, images, availability)
           VALUES($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
           ON CONFLICT(id) DO NOTHING RETURNING ${productColumns}`,
          [id, String(name).trim(), category.id, category.label, category.group, String(description || "").trim(),
            JSON.stringify(specifications), JSON.stringify(images), availability],
        );
        if (result.rowCount > 0) return mapProduct(result.rows[0]);
      }
      throw new Error("Could not allocate a unique product identifier.");
    });
  }

  async updateProduct(id, updates) {
    return this.transaction(async (client) => {
      const current = await this.getProductById(id, client);
      if (!current) return null;
      const category = updates.categoryId ? await this.getCategoryById(updates.categoryId) : {
        id: current.categoryId, label: current.categoryLabel, group: current.group,
      };
      if (!category) throw new Error("Choose a valid product category.");

      const result = await client.query(
        `UPDATE products SET name=$2, category_id=$3, category_label=$4, product_group=$5,
           description=$6, specifications=$7::jsonb, images=$8::jsonb, availability=$9, updated_at=NOW()
         WHERE id=$1 RETURNING ${productColumns}`,
        [id,
          updates.name === undefined ? current.name : String(updates.name).trim(),
          category.id, category.label, category.group,
          updates.description === undefined ? current.description : String(updates.description).trim(),
          JSON.stringify(updates.specifications === undefined ? current.specifications : updates.specifications),
          JSON.stringify(updates.images === undefined ? current.images : updates.images),
          updates.availability === undefined ? current.availability : updates.availability],
      );
      return mapProduct(result.rows[0]);
    });
  }

  async deleteProduct(id) {
    const result = await this.pool.query("DELETE FROM products WHERE id = $1 RETURNING id", [id]);
    return result.rowCount > 0;
  }

  async deleteProductAndQueueImageCleanup(id) {
    return this.transaction(async (client) => {
      const product = await client.query("SELECT id FROM products WHERE id=$1 FOR UPDATE", [id]);
      if (product.rowCount === 0) return null;
      const queued = await client.query(
        `INSERT INTO pending_cloudinary_image_deletions(provider_public_id)
         SELECT provider_public_id FROM product_image_assets WHERE product_id=$1
         ON CONFLICT(provider_public_id) DO NOTHING
         RETURNING provider_public_id`,
        [id],
      );
      await client.query("DELETE FROM products WHERE id=$1", [id]);
      return { id, queuedImageCount: queued.rowCount };
    });
  }

  async queueCloudinaryImageDeletions(publicIds) {
    const uniqueIds = [...new Set((publicIds || []).filter((id) => typeof id === "string" && id.length > 0 && id.length <= 512))];
    if (uniqueIds.length === 0) return 0;
    return this.transaction(async (client) => {
      let inserted = 0;
      for (const publicId of uniqueIds) {
        const result = await client.query(
          "INSERT INTO pending_cloudinary_image_deletions(provider_public_id) VALUES($1) ON CONFLICT(provider_public_id) DO NOTHING",
          [publicId],
        );
        inserted += result.rowCount;
      }
      return inserted;
    });
  }

  async getPendingCloudinaryImageDeletions(limit = 100) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500));
    const result = await this.pool.query(
      `SELECT provider_public_id AS "providerPublicId" FROM pending_cloudinary_image_deletions
       ORDER BY queued_at ASC LIMIT $1`,
      [safeLimit],
    );
    return result.rows;
  }

  async completeCloudinaryImageDeletion(publicId) {
    await this.pool.query("DELETE FROM pending_cloudinary_image_deletions WHERE provider_public_id=$1", [publicId]);
  }

  async recordCloudinaryImageDeletionFailure(publicId) {
    await this.pool.query(
      "UPDATE pending_cloudinary_image_deletions SET attempts=attempts+1, last_attempt_at=NOW() WHERE provider_public_id=$1",
      [publicId],
    );
  }

  async countPendingCloudinaryImageDeletions() {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM pending_cloudinary_image_deletions");
    return result.rows[0].count;
  }

  async addProductImage(id, { assetUrl, providerPublicId }) {
    return this.addProductImages(id, [{ assetUrl, providerPublicId }]);
  }

  async addProductImages(id, assets) {
    return this.transaction(async (client) => {
      const locked = await client.query("SELECT images FROM products WHERE id=$1 FOR UPDATE", [id]);
      if (locked.rowCount === 0) return null;
      const images = Array.isArray(locked.rows[0].images) ? locked.rows[0].images : [];
      for (const asset of assets) {
        if (!images.includes(asset.assetUrl)) images.push(asset.assetUrl);
        await client.query(
          `INSERT INTO product_image_assets(id, product_id, asset_url, provider, provider_public_id)
           VALUES($1, $2, $3, 'cloudinary', $4) ON CONFLICT(product_id, provider_public_id) DO NOTHING`,
          [crypto.randomUUID(), id, asset.assetUrl, asset.providerPublicId],
        );
      }
      await client.query("UPDATE products SET images=$2::jsonb, updated_at=NOW() WHERE id=$1", [id, JSON.stringify(images)]);
      const publicIds = assets.map((asset) => asset.providerPublicId).filter((publicId) => typeof publicId === "string" && publicId.length > 0);
      if (publicIds.length > 0) {
        await client.query("DELETE FROM pending_cloudinary_image_deletions WHERE provider_public_id=ANY($1::text[])", [publicIds]);
      }
      return this.getProductById(id, client);
    });
  }

  async getUploadedImageAssets(productId) {
    const result = await this.pool.query("SELECT provider_public_id AS \"providerPublicId\" FROM product_image_assets WHERE product_id=$1", [productId]);
    return result.rows;
  }

  async getAdminByEmail(email) {
    const normalized = String(email || "").trim().toLowerCase();
    const result = await this.pool.query(
      `SELECT id, email, salt, password_hash AS "passwordHash", role FROM admins WHERE LOWER(email)=$1`, [normalized],
    );
    return result.rows[0] || null;
  }

  async getAdminById(id) {
    const result = await this.pool.query(`SELECT id, email, role FROM admins WHERE id=$1`, [id]);
    return result.rows[0] || null;
  }

  async getSetupStatus() {
    return this.transaction(async (client) => {
      const state = await client.query("SELECT setup_completed_at FROM admin_setup_state WHERE singleton=TRUE FOR UPDATE");
      if (state.rowCount === 0) throw new Error("Administrator setup state has not been initialized.");
      const admins = await client.query("SELECT 1 FROM admins LIMIT 1");
      if (admins.rowCount > 0 && !state.rows[0].setup_completed_at) {
        await client.query("UPDATE admin_setup_state SET setup_completed_at=NOW() WHERE singleton=TRUE");
        return { setupComplete: true };
      }
      return { setupComplete: Boolean(state.rows[0].setup_completed_at) };
    });
  }

  async createInitialAdmin({ email, password }) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid administrator email is required.");
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new Error("The administrator password must contain 12 to 128 characters.");
    }
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const recoveryKey = makeRecoveryKey();
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["daspar:initial-admin"]);
      const state = await client.query("SELECT setup_completed_at FROM admin_setup_state WHERE singleton=TRUE FOR UPDATE");
      if (state.rowCount === 0) throw new Error("Administrator setup state has not been initialized.");
      const count = await client.query("SELECT COUNT(*)::int AS count FROM admins");
      if (state.rows[0].setup_completed_at || count.rows[0].count !== 0) {
        if (!state.rows[0].setup_completed_at && count.rows[0].count !== 0) {
          await client.query("UPDATE admin_setup_state SET setup_completed_at=NOW() WHERE singleton=TRUE");
        }
        throw new Error("Administrator setup is permanently locked after the first account is created.");
      }
      const result = await client.query(
        `INSERT INTO admins(id, email, salt, password_hash) VALUES($1, $2, $3, $4)
         RETURNING id, email, role`,
        [crypto.randomUUID(), normalized, salt, passwordHash],
      );
      await client.query(
        `UPDATE admin_setup_state SET setup_completed_at=NOW(), recovery_key_hash=$1, recovery_key_ciphertext=$2 WHERE singleton=TRUE`,
        [hashToken(recoveryKey), encryptRecoveryKey(recoveryKey)],
      );
      return { ...result.rows[0], recoveryKey };
    });
  }

  async getRecoveryKeyForAdmin(adminId) {
    const result = await this.pool.query(
      `SELECT s.recovery_key_ciphertext FROM admin_setup_state s JOIN admins a ON a.id=$1 WHERE s.singleton=TRUE`, [adminId],
    );
    if (result.rowCount === 0 || !result.rows[0].recovery_key_ciphertext) return null;
    return decryptRecoveryKey(result.rows[0].recovery_key_ciphertext);
  }

  async rotateRecoveryKey(adminId, currentPassword) {
    const recoveryKey = makeRecoveryKey();
    return this.transaction(async (client) => {
      const admin = await client.query("SELECT salt,password_hash FROM admins WHERE id=$1 FOR UPDATE", [adminId]);
      if (admin.rowCount === 0 || !verifyPassword(currentPassword, admin.rows[0]?.salt, admin.rows[0]?.password_hash)) return null;
      await client.query("SELECT singleton FROM admin_setup_state WHERE singleton=TRUE FOR UPDATE");
      await client.query(
        "UPDATE admin_setup_state SET recovery_key_hash=$1,recovery_key_ciphertext=$2 WHERE singleton=TRUE",
        [hashToken(recoveryKey), encryptRecoveryKey(recoveryKey)],
      );
      return recoveryKey;
    });
  }

  async resetAdminPasswordWithRecoveryKey({ email, recoveryKey, password }) {
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new Error("The new password must contain 12 to 128 characters.");
    }
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const newRecoveryKey = makeRecoveryKey();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    return this.transaction(async (client) => {
      const admin = await client.query("SELECT id,email FROM admins WHERE LOWER(email)=$1 FOR UPDATE", [normalizedEmail]);
      if (admin.rowCount === 0) return null;
      const state = await client.query("SELECT recovery_key_hash FROM admin_setup_state WHERE singleton=TRUE FOR UPDATE");
      if (state.rowCount === 0 || !matchesRecoveryKey(recoveryKey, state.rows[0]?.recovery_key_hash)) return null;
      const adminId = admin.rows[0].id;
      await client.query("UPDATE admins SET salt=$2,password_hash=$3,updated_at=NOW() WHERE id=$1", [adminId, salt, passwordHash]);
      await client.query("DELETE FROM sessions WHERE admin_id=$1", [adminId]);
      await client.query(
        "UPDATE admin_setup_state SET recovery_key_hash=$1,recovery_key_ciphertext=$2 WHERE singleton=TRUE",
        [hashToken(newRecoveryKey), encryptRecoveryKey(newRecoveryKey)],
      );
      return { id: adminId, email: admin.rows[0].email, recoveryKey: newRecoveryKey };
    });
  }

  async createSession(adminId, ttlHours = config.sessionTtlHours) {
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const result = await this.pool.query(
      `INSERT INTO sessions(token_hash, admin_id, expires_at)
       VALUES($1, $2, NOW() + ($3::int * INTERVAL '1 hour'))
       RETURNING created_at AS "createdAt", expires_at AS "expiresAt"`,
      [tokenHash, adminId, ttlHours],
    );
    return { token, createdAt: mapDate(result.rows[0].createdAt), expiresAt: mapDate(result.rows[0].expiresAt) };
  }

  async getSession(token) {
    if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;
    const result = await this.pool.query(
      `SELECT s.token_hash, s.admin_id AS "adminId", a.email AS "adminEmail", a.role,
              s.created_at AS "createdAt", s.expires_at AS "expiresAt"
       FROM sessions s JOIN admins a ON a.id=s.admin_id
       WHERE s.token_hash=$1 AND s.expires_at > NOW()`, [hashToken(token)],
    );
    return result.rows[0] ? { ...result.rows[0], createdAt: mapDate(result.rows[0].createdAt), expiresAt: mapDate(result.rows[0].expiresAt) } : null;
  }

  async deleteSession(token) {
    if (typeof token !== "string" || token.length < 32 || token.length > 256) return false;
    const result = await this.pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
    return result.rowCount > 0;
  }

  async deleteAdminSessions(adminId) {
    const result = await this.pool.query("DELETE FROM sessions WHERE admin_id=$1", [adminId]);
    return result.rowCount;
  }

  async changeAdminPassword(adminId, currentPassword, newPassword) {
    if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) {
      throw new Error("The new password must contain 12 to 128 characters.");
    }
    return this.transaction(async (client) => {
      const result = await client.query("SELECT salt, password_hash FROM admins WHERE id=$1 FOR UPDATE", [adminId]);
      if (result.rowCount === 0) return false;
      if (!verifyPassword(currentPassword, result.rows[0].salt, result.rows[0].password_hash)) return false;
      const salt = generateSalt();
      const passwordHash = hashPassword(newPassword, salt);
      await client.query("UPDATE admins SET salt=$2, password_hash=$3, updated_at=NOW() WHERE id=$1", [adminId, salt, passwordHash]);
      await client.query("DELETE FROM sessions WHERE admin_id=$1", [adminId]);
      return true;
    });
  }

  async setAdminPassword(adminId, password) {
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new Error("The administrator password must contain 12 to 128 characters.");
    }
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    return this.transaction(async (client) => {
      const result = await client.query("UPDATE admins SET salt=$2, password_hash=$3, updated_at=NOW() WHERE id=$1 RETURNING email", [adminId, salt, passwordHash]);
      if (result.rowCount === 0) return false;
      await client.query("DELETE FROM sessions WHERE admin_id=$1", [adminId]);
      return result.rows[0].email;
    });
  }

  async updateAdminEmail(adminId, email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email address is required.");
    return this.transaction(async (client) => {
      const result = await client.query("UPDATE admins SET email=$2, updated_at=NOW() WHERE id=$1 RETURNING id, email, role", [adminId, normalized]);
      if (result.rowCount === 0) return null;
      await client.query("DELETE FROM sessions WHERE admin_id=$1", [adminId]);
      return result.rows[0];
    });
  }

  async createPasswordResetToken(email, token, ttlMinutes = 30) {
    const admin = await this.getAdminByEmail(email);
    if (!admin) return null;
    const tokenHash = hashToken(token);
    await this.transaction(async (client) => {
      await client.query("DELETE FROM password_reset_tokens WHERE admin_id=$1", [admin.id]);
      await client.query(
        `INSERT INTO password_reset_tokens(token_hash, admin_id, expires_at)
         VALUES($1, $2, NOW() + ($3::int * INTERVAL '1 minute'))`,
        [tokenHash, admin.id, ttlMinutes],
      );
    });
    return { id: admin.id, email: admin.email };
  }

  async deletePasswordResetToken(token) {
    if (typeof token !== "string" || token.length < 32 || token.length > 256) return false;
    const result = await this.pool.query("DELETE FROM password_reset_tokens WHERE token_hash=$1", [hashToken(token)]);
    return result.rowCount > 0;
  }

  async consumePasswordReset(token, password) {
    if (typeof token !== "string" || token.length < 32 || token.length > 256) return false;
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      throw new Error("The new password must contain 12 to 128 characters.");
    }
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    return this.transaction(async (client) => {
      const reset = await client.query(
        `SELECT admin_id FROM password_reset_tokens
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`, [hashToken(token)],
      );
      if (reset.rowCount === 0) return false;
      const adminId = reset.rows[0].admin_id;
      await client.query("UPDATE admins SET salt=$2, password_hash=$3, updated_at=NOW() WHERE id=$1", [adminId, salt, passwordHash]);
      await client.query("DELETE FROM sessions WHERE admin_id=$1", [adminId]);
      await client.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE token_hash=$1", [hashToken(token)]);
      return true;
    });
  }

  async addContactInquiry({ name, email, subject, message }) {
    const result = await this.pool.query(
      `INSERT INTO contact_inquiries(id, name, email, subject, message)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, name, email, subject, message, created_at AS "createdAt"`,
      [crypto.randomUUID(), name.trim(), email.trim().toLowerCase(), subject.trim(), message.trim()],
    );
    return { ...result.rows[0], createdAt: mapDate(result.rows[0].createdAt) };
  }

  async getContactInquiries({ limit = 200 } = {}) {
    const result = await this.pool.query(
      `SELECT id, name, email, subject, message, created_at AS "createdAt"
       FROM contact_inquiries ORDER BY created_at DESC LIMIT $1`, [Math.max(1, Math.min(Number(limit) || 200, 500))],
    );
    return result.rows.map((row) => ({ ...row, createdAt: mapDate(row.createdAt) }));
  }

  async logAudit({ adminId = null, adminEmail, action, productId = null, details = "" }) {
    const result = await this.pool.query(
      `INSERT INTO audit_logs(id, admin_id, admin_email, action, product_id, details)
       VALUES($1, $2, $3, $4, $5, $6)
       RETURNING id, admin_email AS "adminEmail", action, product_id AS "productId", details, created_at AS timestamp`,
      [crypto.randomUUID(), adminId, String(adminEmail || "system"), String(action).slice(0, 80), productId, String(details).slice(0, 2000)],
    );
    return result.rows[0];
  }

  async getAuditLogs({ limit = 200 } = {}) {
    const result = await this.pool.query(
      `SELECT id, admin_email AS "adminEmail", action, product_id AS "productId", details, created_at AS timestamp
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [Math.max(1, Math.min(Number(limit) || 200, 500))],
    );
    return result.rows.map((row) => ({ ...row, timestamp: mapDate(row.timestamp) }));
  }

  async getStats() {
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS "totalProducts",
         COUNT(*) FILTER (WHERE availability='in_stock')::int AS "inStock",
         (SELECT COUNT(DISTINCT image)::int FROM products p
          CROSS JOIN LATERAL jsonb_array_elements_text(p.images) AS image) AS "totalPhotos"
       FROM products`,
    );
    return result.rows[0];
  }

  async consumeRateLimit(key, maxHits, windowSeconds) {
    const digest = crypto.createHash("sha256").update(String(key), "utf8").digest("hex");
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`rate:${digest}`]);
      await client.query("DELETE FROM rate_limit_events WHERE occurred_at < NOW() - ($1::int * INTERVAL '1 second')", [windowSeconds]);
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM rate_limit_events
         WHERE bucket_hash=$1 AND occurred_at >= NOW() - ($2::int * INTERVAL '1 second')`, [digest, windowSeconds],
      );
      const count = countResult.rows[0].count;
      if (count >= maxHits) return { allowed: false, remaining: 0, retryAfter: windowSeconds };
      await client.query("INSERT INTO rate_limit_events(bucket_hash) VALUES($1)", [digest]);
      return { allowed: true, remaining: maxHits - count - 1, retryAfter: 0 };
    });
  }

  async ping() {
    const result = await this.pool.query("SELECT 1 AS ready");
    return result.rows[0]?.ready === 1;
  }
}

export const db = new Database();
export { hashToken };
