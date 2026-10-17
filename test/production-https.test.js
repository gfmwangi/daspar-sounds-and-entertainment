import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const productionCheck = String.raw`
  import { db } from "./server/db/database.js";
  import { createApp } from "./server/app.js";
  db.ping = async () => true;
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const plainPage = await fetch(base + "/not-a-page");
    const health = await fetch(base + "/api/health");
    const forwardedPage = await fetch(base + "/not-a-page", { headers: { "X-Forwarded-Proto": "https" } });
    if (plainPage.status !== 426 || health.status !== 200 || forwardedPage.status !== 404) {
      throw new Error("Unexpected HTTP boundary statuses.");
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close().catch(() => {});
  }
`;

test("production rejects plain HTTP except health checks and accepts the trusted HTTPS proxy scheme", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", productionCheck], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      SERVER_HOST: "0.0.0.0",
      TRUST_PROXY_HOPS: "1",
      SESSION_SECRET: "synthetic-production-https-test-secret-123456",
      PUBLIC_ORIGIN: "https://daspar.example",
      CORS_ORIGINS: "https://daspar.example",
      DATABASE_URL: "postgresql://test-user:synthetic-password@db.example.test/daspar_test?sslmode=require",
    },
    timeout: 10_000,
  });
  assert.equal(result.error, undefined, "the production HTTP test process must exit normally");
  assert.equal(result.status, 0, `production HTTP security check failed: ${result.stderr || result.stdout}`);
});
