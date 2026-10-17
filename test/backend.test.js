import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "../server/config.js";
import { db, Database } from "../server/db/database.js";
import { verifyPassword } from "../server/services/authService.js";
import { createApp } from "../server/app.js";
import { postgresClientEnvironment } from "../server/scripts/backup-helpers.js";

function assertDisposableDatabase() {
  const databaseUrl = new URL(config.databaseUrl);
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname);
  const testName = /(^|[_-])test([_-]|$)/i.test(databaseName);
  if (config.nodeEnv !== "test" || !localHost || !testName) {
    throw new Error("Backend integration tests require NODE_ENV=test and a loopback PostgreSQL database whose name contains a separate test segment.");
  }
}

function requestHeaders(origin, cookie) {
  const headers = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

test("backup utilities preserve supported PostgreSQL TLS options without inheriting app secrets", () => {
  const environment = postgresClientEnvironment(
    "postgresql://test-user:synthetic-password@db.example.test:5433/daspar_test?sslmode=verify-full&sslrootcert=%2Ftmp%2Fprovider-ca.pem&channel_binding=require&target_session_attrs=primary&application_name=provider-test",
  );
  assert.equal(environment.PGSSLMODE, "verify-full");
  assert.equal(environment.PGSSLROOTCERT, "/tmp/provider-ca.pem");
  assert.equal(environment.PGCHANNELBINDING, "require");
  assert.equal(environment.PGTARGETSESSIONATTRS, "primary");
  assert.equal(environment.PGAPPNAME, "provider-test");
  assert.equal(environment.PGPASSWORD, "synthetic-password");
  assert.equal("DATABASE_URL" in environment, false);
  assert.equal("BACKUP_ENCRYPTION_KEY" in environment, false);
  assert.equal("SESSION_SECRET" in environment, false);
  assert.throws(
    () => postgresClientEnvironment("postgresql://test-user:synthetic-password@db.example.test/daspar_test?sslpassword=synthetic-key-passphrase"),
    /unsupported PostgreSQL connection option 'sslpassword'/,
  );
  assert.throws(
    () => postgresClientEnvironment("postgresql://test-user:synthetic-password@db.example.test/daspar_test?sslmode=verify-full&sslmode=prefer"),
    /repeats the PostgreSQL connection option 'sslmode'/,
  );
});

let listener;
let restoreCloudinaryStubs = () => {};
after(async () => {
  if (listener?.listening) await new Promise((resolve) => listener.close(resolve));
  restoreCloudinaryStubs();
  try {
    if (config.nodeEnv === "test" && db.pool) {
      await db.pool.query("DELETE FROM contact_inquiries WHERE email LIKE '%.test'").catch(() => {});
      await db.pool.query("DELETE FROM rate_limit_events").catch(() => {});
      await db.pool.query("DELETE FROM pending_cloudinary_image_deletions WHERE provider_public_id LIKE 'daspar-test/%'").catch(() => {});
    }
  } finally {
    await db.close().catch(() => {});
  }
});

test("PostgreSQL-backed DASPAR API protects administrator data and reports contact delivery truthfully", async () => {
  assertDisposableDatabase();
  await db.init();

  const testEmail = process.env.TEST_ADMIN_EMAIL || "";
  const testPassword = process.env.TEST_ADMIN_PASSWORD || "";
  assert.match(testEmail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  assert.ok(testPassword.length >= 32, "a synthetic test password must be configured privately");
  const existingCount = await db.pool.query("SELECT COUNT(*)::int AS count FROM admins");
  const firstSetupNeeded = existingCount.rows[0].count === 0;
  if (!firstSetupNeeded) {
    assert.equal(existingCount.rows[0].count, 1, "the local disposable DB must contain no other admin accounts");
    const existing = await db.getAdminByEmail(testEmail);
    assert.ok(existing, "the only existing test database administrator must be the synthetic fixture");
    assert.ok(verifyPassword(testPassword, existing.salt, existing.passwordHash), "test credentials must match the synthetic fixture");
  }

  const [products, categories, stats] = await Promise.all([db.getProducts(), db.getCategories(), db.getStats()]);
  assert.equal(products.length, 30);
  assert.equal(categories.length, 10);
  assert.deepEqual(stats, { totalProducts: 30, inStock: 30, totalPhotos: 38 });
  assert.ok((await db.getProducts({ q: "Pro" })).length > 0);
  assert.equal((await db.getProducts({ q: "%" })).length, 0, "search wildcards must not become query syntax");

  listener = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    listener.once("listening", resolve);
    listener.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${listener.address().port}`;
  const origin = "http://localhost:3000";
  const api = (route, options = {}) => fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { ...requestHeaders(origin, options.cookie), ...(options.headers || {}) },
  });

  const setupStatusResponse = await api("/api/admin/setup/status");
  assert.equal(setupStatusResponse.status, 200);
  const setupStatus = await setupStatusResponse.json();
  assert.equal(setupStatus.setupComplete, !firstSetupNeeded);
  let recoveryKey = null;
  if (firstSetupNeeded) {
    const setup = await api("/api/admin/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword, confirmPassword: testPassword }),
    });
    assert.equal(setup.status, 201);
    const setupPayload = await setup.json();
    recoveryKey = setupPayload.recoveryKey;
    assert.match(recoveryKey, /^DASPAR-(?:[0-9A-F]{4}-){9}[0-9A-F]{4}$/);
    assert.equal(setupPayload.setupComplete, true);
    const repeatedSetup = await api("/api/admin/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `second-${crypto.randomUUID()}@example.test`, password: testPassword, confirmPassword: testPassword }),
    });
    assert.equal(repeatedSetup.status, 409, "first-owner setup must be permanently locked after one successful completion");
    assert.equal((await api("/api/admin/setup/status").then((response) => response.json())).setupComplete, true);
  }

  const health = await api("/api/health");
  assert.equal(health.status, 200);

  const publicProducts = await api("/api/public/products");
  assert.equal(publicProducts.status, 200);
  assert.equal((await publicProducts.json()).length, 30);
  const publicCategories = await api("/api/public/categories");
  assert.equal((await publicCategories.json()).length, 10);

  const blockedOrigin = await fetch(`${baseUrl}/api/public/products`, { headers: { Origin: "https://untrusted.example" } });
  assert.equal(blockedOrigin.status, 403);

  const bearerOnly = await api("/api/admin/stats", { headers: { Authorization: "Bearer deliberately-invalid" } });
  assert.equal(bearerOnly.status, 401, "bearer tokens must not bypass the HttpOnly session cookie");
  const anonymousInquiries = await api("/api/admin/inquiries");
  assert.equal(anonymousInquiries.status, 401, "customer inquiry records must not be public");
  const openRegistration = await api("/api/admin/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(openRegistration.status, 404, "administrator registration must not be publicly available");

  const login = await api("/api/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(login.status, 200);
  const loginPayload = await login.json();
  assert.equal(loginPayload.authenticated, true);
  assert.equal("token" in loginPayload, false, "raw session tokens must not be returned in JSON");
  const setCookie = login.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const cookie = setCookie.split(";")[0];
  assert.match(cookie, /^daspar_session=/);

  const adminStats = await api("/api/admin/stats", { headers: requestHeaders(origin, cookie) });
  assert.equal(adminStats.status, 200);
  assert.deepEqual(await adminStats.json(), { totalProducts: 30, inStock: 30, totalPhotos: 38 });

  const accountResponse = await api("/api/admin/account", { headers: requestHeaders(origin, cookie) });
  assert.equal(accountResponse.status, 200);
  const accountPayload = await accountResponse.json();
  assert.equal(accountPayload.email, testEmail.toLowerCase());
  assert.equal("passwordHash" in accountPayload, false);
  assert.equal("salt" in accountPayload, false);
  assert.equal(accountPayload.recoveryKey, null, "the ordinary account response must never disclose the recovery key");
  const rotateKeyResponse = await api("/api/admin/account/recovery-key/rotate", {
    method: "POST", cookie, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: testPassword }),
  });
  assert.equal(rotateKeyResponse.status, 200);
  const rotatedKeyPayload = await rotateKeyResponse.json();
  assert.match(rotatedKeyPayload.recoveryKey, /^DASPAR-(?:[0-9A-F]{4}-){9}[0-9A-F]{4}$/);
  recoveryKey = rotatedKeyPayload.recoveryKey;
  assert.equal(await db.getRecoveryKeyForAdmin((await db.getAdminByEmail(testEmail)).id), recoveryKey);
  const rejectedRecoveryKeyView = await api("/api/admin/account/recovery-key/view", {
    method: "POST", cookie, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "deliberately-wrong-synthetic-password" }),
  });
  assert.equal(rejectedRecoveryKeyView.status, 401, "viewing a stored recovery key must require the current password");
  const verifiedRecoveryKeyView = await api("/api/admin/account/recovery-key/view", {
    method: "POST", cookie, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: testPassword }),
  });
  assert.equal(verifiedRecoveryKeyView.status, 200);
  assert.equal((await verifiedRecoveryKeyView.json()).recoveryKey, recoveryKey, "the verified owner may view the current key");
  const blockedEmailChange = await api("/api/admin/account/email", {
    method: "PATCH", cookie, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "new-owner@example.test", currentPassword: "deliberately-wrong-synthetic-password" }),
  });
  assert.equal(blockedEmailChange.status, 401, "email changes must require the current password");
  const blockedPasswordChange = await api("/api/admin/account/password", {
    method: "POST", cookie, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "deliberately-wrong-synthetic-password", password: "synthetic-new-password-123", confirmPassword: "synthetic-new-password-123" }),
  });
  assert.equal(blockedPasswordChange.status, 401, `password changes must require the current password; response was ${JSON.stringify(await blockedPasswordChange.json())}`);

  const originalLogAudit = db.logAudit.bind(db);
  db.logAudit = async () => { throw new Error("synthetic audit sink failure"); };
  let auditFailureProductId;
  try {
    const auditFailureResponse = await api("/api/admin/products", {
      method: "POST", cookie, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Disposable Audit Failure Product", categoryId: categories[0].id, description: "Synthetic fixture only", specifications: [], availability: "pending" }),
    });
    assert.equal(auditFailureResponse.status, 201, "an audit-log outage must not make a committed product appear unsaved");
    auditFailureProductId = (await auditFailureResponse.json()).id;
  } finally {
    db.logAudit = originalLogAudit;
  }
  assert.ok(auditFailureProductId);
  await api(`/api/admin/products/${encodeURIComponent(auditFailureProductId)}`, { method: "DELETE", cookie });

  const createResponse = await api("/api/admin/products", {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Disposable API Test Product", categoryId: categories[0].id, description: "Synthetic fixture only", specifications: [], availability: "pending" }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  const intentProduct = await db.createProduct({ name: "Disposable Upload Intent Product", categoryId: categories[0].id, description: "Synthetic fixture only", specifications: [], images: [], availability: "pending" });
  const reservedPublicId = `daspar/products/${crypto.randomUUID()}`;
  assert.equal(await db.queueCloudinaryImageDeletions([reservedPublicId]), 1);
  assert.ok((await db.getPendingCloudinaryImageDeletions()).some((item) => item.providerPublicId === reservedPublicId));
  const attachedIntentProduct = await db.addProductImages(intentProduct.id, [{ assetUrl: "https://images.example.test/disposable-only.webp", providerPublicId: reservedPublicId }]);
  assert.ok(attachedIntentProduct.images.includes("https://images.example.test/disposable-only.webp"));
  assert.equal((await db.getPendingCloudinaryImageDeletions()).some((item) => item.providerPublicId === reservedPublicId), false, "successful database attachment atomically completes its reserved cleanup intent");
  await db.deleteProduct(intentProduct.id);
  const updateResponse = await api(`/api/admin/products/${encodeURIComponent(created.id)}`, {
    method: "PATCH",
    cookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ availability: "out_of_stock" }),
  });
  assert.equal((await updateResponse.json()).availability, "out_of_stock");

  const inquiryResponse = await api("/api/contact-inquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Synthetic Visitor", email: "visitor@example.test", subject: "Disposable test", message: "Not a real customer inquiry." }),
  });
  assert.equal(inquiryResponse.status, 201);
  const inquiryPayload = await inquiryResponse.json();
  assert.equal(inquiryPayload.emailNotificationAccepted, false);
  assert.match(inquiryPayload.message, /no email was sent/i);
  const privateInquiries = await api("/api/admin/inquiries", { headers: requestHeaders(origin, cookie) });
  assert.ok((await privateInquiries.json()).some((item) => item.id === inquiryPayload.inquiryId));

  const recovery = await api("/api/admin/password-reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail }),
  });
  assert.equal(recovery.status, 503, "missing mail credentials must not produce a false sent claim");
  assert.match((await recovery.json()).error, /no reset email was sent/i);

  const uploadUnavailable = await api(`/api/admin/products/${encodeURIComponent(created.id)}/images`, {
    method: "POST",
    cookie,
  });
  if (!config.cloudinaryUrl) {
    assert.equal(uploadUnavailable.status, 503, "missing object-storage configuration must fail explicitly");
  } else {
    assert.equal(uploadUnavailable.status, 400, "an empty upload request must be rejected when storage is configured");
    const { v2: cloudinary } = await import("cloudinary");
    const originalUpload = cloudinary.uploader.upload;
    const originalDestroy = cloudinary.uploader.destroy;
    let uploadAttempts = 0;
    cloudinary.uploader.upload = async () => {
      uploadAttempts += 1;
      throw new Error("A rejected synthetic image must never reach the provider.");
    };
    cloudinary.uploader.destroy = async () => {
      throw new Error("Simulated provider outage keeps cleanup queued for the integration assertion.");
    };
    restoreCloudinaryStubs = () => {
      cloudinary.uploader.upload = originalUpload;
      cloudinary.uploader.destroy = originalDestroy;
    };

    const deceptiveImage = new FormData();
    deceptiveImage.append("photos", new Blob(["plain text, not an image"], { type: "image/png" }), "synthetic-invalid.png");
    const invalidImageResponse = await api(`/api/admin/products/${encodeURIComponent(created.id)}/images`, {
      method: "POST", cookie, body: deceptiveImage,
    });
    assert.equal(invalidImageResponse.status, 400, "content sniffing must reject a text file even when its name and browser MIME type claim PNG");
    assert.match((await invalidImageResponse.json()).error, /not valid JPEG, PNG, WebP, or AVIF/i);
    assert.equal(uploadAttempts, 0, "invalid content must be rejected before the provider receives an upload");
  }

  const deleteResponse = await api(`/api/admin/products/${encodeURIComponent(created.id)}`, { method: "DELETE", cookie });
  assert.equal(deleteResponse.status, 200);
  assert.equal((await deleteResponse.json()).imageCleanupPending, false);
  assert.equal(await db.getProductById(created.id), null);

  const productWithImage = await db.createProduct({ name: "Disposable Image Cleanup Product", categoryId: categories[0].id, description: "Synthetic fixture only", specifications: [], images: [], availability: "pending" });
  const providerPublicId = `daspar-test/${crypto.randomUUID()}`;
  await db.addProductImages(productWithImage.id, [{ assetUrl: "https://images.example.test/synthetic-only.webp", providerPublicId }]);
  const imageProductDeletion = await api(`/api/admin/products/${encodeURIComponent(productWithImage.id)}`, { method: "DELETE", cookie });
  assert.equal(imageProductDeletion.status, 200);
  assert.equal((await imageProductDeletion.json()).imageCleanupPending, true, "deleted product image IDs must remain tracked while Cloudinary is unavailable");
  assert.ok((await db.getPendingCloudinaryImageDeletions()).some((item) => item.providerPublicId === providerPublicId));
  await db.completeCloudinaryImageDeletion(providerPublicId);
  const restartedRepository = new Database();
  try {
    await restartedRepository.init();
    assert.equal(await restartedRepository.getProductById(created.id), null, "deleted records must not be restored when a fresh application repository starts");
    assert.equal((await restartedRepository.getProducts()).length, 30, "a fresh repository must retain the original initialized catalogue without overwriting edits");
  } finally {
    await restartedRepository.close();
  }

  const owner = await db.getAdminByEmail(testEmail);
  const changedEmail = `owner-${crypto.randomUUID()}@example.test`;
  const changedPassword = `Synthetic-new-${crypto.randomUUID()}-pass`;
  try {
    const emailUpdate = await api("/api/admin/account/email", {
      method: "PATCH", cookie, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: changedEmail, currentPassword: testPassword }),
    });
    assert.equal(emailUpdate.status, 200);
    assert.match((await emailUpdate.json()).message, /sign in again/i);
    const oldSessionAfterEmailChange = await api("/api/admin/session", { headers: requestHeaders(origin, cookie) });
    assert.equal((await oldSessionAfterEmailChange.json()).authenticated, false, "changing the email must revoke the old session");

    const newEmailLogin = await api("/api/admin/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: changedEmail, password: testPassword }),
    });
    assert.equal(newEmailLogin.status, 200);
    const newCookie = (newEmailLogin.headers.get("set-cookie") || "").split(";")[0];
    assert.match(newCookie, /^daspar_session=/);

    const passwordUpdate = await api("/api/admin/account/password", {
      method: "POST", cookie: newCookie, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: testPassword, password: changedPassword, confirmPassword: changedPassword }),
    });
    assert.equal(passwordUpdate.status, 200);
    const oldPasswordSession = await api("/api/admin/session", { headers: requestHeaders(origin, newCookie) });
    assert.equal((await oldPasswordSession.json()).authenticated, false, "changing the password must revoke the current session");

    const newPasswordLogin = await api("/api/admin/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: changedEmail, password: changedPassword }),
    });
    assert.equal(newPasswordLogin.status, 200, "the updated credentials must permit a fresh login");
  } finally {
    await db.updateAdminEmail(owner.id, testEmail);
    await db.setAdminPassword(owner.id, testPassword);
  }

  const logout = await api("/api/admin/session", { method: "DELETE", cookie });
  assert.equal(logout.status, 200);
  const afterLogout = await api("/api/admin/session", { headers: requestHeaders(origin, cookie) });
  assert.equal((await afterLogout.json()).authenticated, false);

  const emergencyPassword = `Synthetic-emergency-${crypto.randomUUID()}-pass`;
  const emergencyReset = await api("/api/admin/recovery-key/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, recoveryKey, password: emergencyPassword, confirmPassword: emergencyPassword }),
  });
  assert.equal(emergencyReset.status, 200);
  const emergencyPayload = await emergencyReset.json();
  assert.notEqual(emergencyPayload.recoveryKey, recoveryKey, "a successful emergency reset must rotate the recovery key");
  const replayPassword = `Another-${crypto.randomUUID()}-pass`;
  const consumedKeyReplay = await api("/api/admin/recovery-key/reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, recoveryKey, password: replayPassword, confirmPassword: replayPassword }),
  });
  assert.equal(consumedKeyReplay.status, 401, "the old key must not be usable after successful key rotation");
  const emergencyLogin = await api("/api/admin/session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: emergencyPassword }),
  });
  assert.equal(emergencyLogin.status, 200, "the emergency reset password must allow a fresh login");
  const replacementKey = await db.getRecoveryKeyForAdmin((await db.getAdminByEmail(testEmail)).id);
  assert.equal(replacementKey, emergencyPayload.recoveryKey, "the replacement key must be persisted for account lifecycle management");
  await db.setAdminPassword((await db.getAdminByEmail(testEmail)).id, testPassword);
});
