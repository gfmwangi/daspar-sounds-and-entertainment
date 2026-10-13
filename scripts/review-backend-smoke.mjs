import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "daspar-backend-review-"));
const testEmail = `review-${randomUUID()}@example.invalid`;
const testPassword = randomBytes(32).toString("hex");

Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "5000",
  SERVER_HOST: "127.0.0.1",
  ADMIN_EMAIL: testEmail,
  ADMIN_INITIAL_PASSWORD: testPassword,
  CORS_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
  DATA_FILE: path.join(tempRoot, "store.json"),
  PRODUCT_UPLOADS_DIR: path.join(tempRoot, "uploads"),
});

const { db } = await import("../server/db/database.js");
const { createApp } = await import("../server/app.js");
let server;

try {
  await db.init();
  server = await new Promise((resolve, reject) => {
    const instance = createApp().listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });

  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options = {}) => fetch(`${origin}${route}`, options);
  const jsonHeaders = { "Content-Type": "application/json" };

  const health = await request("/api/health");
  assert.equal(health.status, 200, "health endpoint should respond");
  assert.equal((await health.json()).status, "healthy");

  const catalogResponse = await request("/api/public/products", {
    headers: { Origin: "http://127.0.0.1:3000" },
  });
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalog.length, 30, "seed catalogue should contain the supplied 30 products");
  assert.equal(catalogResponse.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000");

  const categoriesResponse = await request("/api/public/categories");
  const categories = await categoriesResponse.json();
  assert.equal(categories.length, 10, "seed catalogue should contain 10 categories");

  const deniedOriginResponse = await request("/api/public/products", {
    headers: { Origin: "https://not-allowed.example" },
  });
  assert.equal(deniedOriginResponse.status, 200);
  assert.equal(deniedOriginResponse.headers.get("access-control-allow-origin"), null, "unlisted origins must not receive CORS access");

  const unauthenticated = await request("/api/admin/products");
  assert.equal(unauthenticated.status, 401, "admin APIs must reject unauthenticated requests");

  const loginResponse = await request("/api/admin/session", {
    method: "POST",
    headers: { ...jsonHeaders, Origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(loginResponse.status, 200, "disposable local credentials should authenticate");
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.authenticated, true);
  assert.equal(JSON.stringify(loginBody).includes(testPassword), false, "password must not be returned");

  const setCookie = loginResponse.headers.getSetCookie?.()[0] || loginResponse.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly/i, "session cookie should be HttpOnly");
  assert.match(setCookie, /SameSite=Lax/i, "local session cookie should use SameSite=Lax");
  const cookie = setCookie.split(";")[0];
  assert.match(cookie, /^daspar_session=.+$/, "login should set the named session cookie");
  const rawToken = cookie.slice("daspar_session=".length);
  assert.equal(JSON.stringify(loginBody).includes(rawToken), false, "raw session token must not appear in JSON");
  const authHeaders = { Cookie: cookie };

  const sessionResponse = await request("/api/admin/session", { headers: authHeaders });
  assert.equal((await sessionResponse.json()).authenticated, true);

  const adminProductsResponse = await request("/api/admin/products", { headers: authHeaders });
  assert.equal(adminProductsResponse.status, 200);
  assert.equal((await adminProductsResponse.json()).length, 30);

  const baselineStatsResponse = await request("/api/admin/stats", { headers: authHeaders });
  const baselineStats = await baselineStatsResponse.json();
  assert.equal(baselineStatsResponse.status, 200);
  assert.equal(baselineStats.totalProducts, 30);
  assert.equal(baselineStats.inStock, 30);
  assert.equal(baselineStats.totalPhotos, 38);

  const storeAfterLogin = JSON.parse(await readFile(process.env.DATA_FILE, "utf8"));
  const expectedTokenHash = createHash("sha256").update(rawToken).digest("hex");
  assert.equal(storeAfterLogin.sessions.length, 1);
  assert.equal(storeAfterLogin.sessions[0].tokenHash, expectedTokenHash, "only a one-way hash of the session token should be stored");
  assert.equal(Object.hasOwn(storeAfterLogin.sessions[0], "token"), false);
  assert.equal((await readFile(process.env.DATA_FILE, "utf8")).includes(testPassword), false, "plaintext password must not be stored");

  const invalidProductResponse = await request("/api/admin/products", {
    method: "POST",
    headers: { ...jsonHeaders, ...authHeaders },
    body: JSON.stringify({ name: "Invalid field test", categoryId: categories[0].id, unexpected: "rejected" }),
  });
  assert.equal(invalidProductResponse.status, 400, "unknown product fields must be rejected");

  const createResponse = await request("/api/admin/products", {
    method: "POST",
    headers: { ...jsonHeaders, ...authHeaders },
    body: JSON.stringify({
      name: "Temporary API Smoke Product",
      categoryId: categories[0].id,
      description: "Synthetic test record; not real business data.",
      specifications: [{ label: "Review", value: "Temporary" }],
      availability: "in_stock",
      images: [],
    }),
  });
  assert.equal(createResponse.status, 201);
  const createdProduct = await createResponse.json();

  const updateResponse = await request(`/api/admin/products/${encodeURIComponent(createdProduct.id)}`, {
    method: "PATCH",
    headers: { ...jsonHeaders, ...authHeaders },
    body: JSON.stringify({ description: "Updated synthetic test record." }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).description, "Updated synthetic test record.");

  const form = new FormData();
  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9kAAAAASUVORK5CYII=", "base64");
  form.append("photos", new Blob([onePixelPng], { type: "image/png" }), "smoke-test.png");
  const uploadResponse = await request(`/api/admin/products/${encodeURIComponent(createdProduct.id)}/images`, {
    method: "POST",
    headers: authHeaders,
    body: form,
  });
  assert.equal(uploadResponse.status, 200);
  const uploadBody = await uploadResponse.json();
  const uploadedUrl = uploadBody.product.images.find((image) => image.startsWith("/uploads/products/"));
  assert.ok(uploadedUrl, "uploaded image should be attached using the dedicated local URL");
  const uploadedImageResponse = await request(uploadedUrl);
  assert.equal(uploadedImageResponse.status, 200, "local uploaded image should be retrievable");

  const contactResponse = await request("/api/contact-inquiries", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      name: "Synthetic Review Visitor",
      email: "review-visitor@example.invalid",
      subject: "Local smoke test",
      message: "Synthetic inquiry; do not contact anyone.",
    }),
  });
  assert.equal(contactResponse.status, 201);
  const contactBody = await contactResponse.json();
  assert.match(contactBody.message, /saved in the local review store/i);
  assert.match(contactBody.message, /no email has been sent/i);

  const inquiriesResponse = await request("/api/admin/inquiries", { headers: authHeaders });
  assert.equal(inquiriesResponse.status, 200);
  assert.equal((await inquiriesResponse.json()).length, 1);

  const deleteResponse = await request(`/api/admin/products/${encodeURIComponent(createdProduct.id)}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  assert.equal(deleteResponse.status, 200);
  assert.equal(db.getProductById(createdProduct.id), null);

  const logoutResponse = await request("/api/admin/session", { method: "DELETE", headers: authHeaders });
  assert.equal(logoutResponse.status, 200);
  const afterLogout = await request("/api/admin/products", { headers: authHeaders });
  assert.equal(afterLogout.status, 401, "admin access should end after logout");

  for (const [label, overrides, expected] of [
    ["missing admin email guard", { NODE_ENV: "test", ADMIN_EMAIL: "" }, /Set a valid, disposable ADMIN_EMAIL/i],
    ["weak password guard", { NODE_ENV: "test", ADMIN_INITIAL_PASSWORD: "short" }, /at least 16 characters/i],
    ["production guard", { NODE_ENV: "production" }, /cannot start with NODE_ENV=production/i],
    ["loopback host guard", { NODE_ENV: "test", SERVER_HOST: "0.0.0.0" }, /SERVER_HOST must be a loopback address/i],
  ]) {
    const guard = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./server/config.js")'], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        SERVER_HOST: "127.0.0.1",
        ADMIN_EMAIL: "review-guard@example.invalid",
        ADMIN_INITIAL_PASSWORD: randomBytes(32).toString("hex"),
        ...overrides,
      },
    });
    assert.notEqual(guard.status, 0, `${label} should refuse startup`);
    assert.match(`${guard.stderr}\n${guard.stdout}`, expected, `${label} should report the intended guard`);
  }

  console.log("PASS: health, catalogue, categories, and origin allowlist");
  console.log("PASS: protected admin routes, session cookie, hashed token, and logout");
  console.log("PASS: product validation, create/update/delete, and local image upload");
  console.log("PASS: inquiry stored locally with explicit no-email response");
  console.log("PASS: production startup and non-loopback host are refused");
  console.log("All smoke-test data and uploads used a disposable temporary directory.");
} finally {
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(tempRoot, { recursive: true, force: true });
}
