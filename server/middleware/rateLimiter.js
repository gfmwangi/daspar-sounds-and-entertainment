import { db } from "../db/database.js";
import { config } from "../config.js";

function databaseRateLimiter({ buckets, message }) {
  return async (req, res, next) => {
    try {
      for (const bucket of buckets) {
        const key = bucket.key(req);
        const decision = await db.consumeRateLimit(key, bucket.maxHits, bucket.windowSeconds);
        if (!decision.allowed) {
          res.setHeader("Retry-After", String(decision.retryAfter));
          return res.status(429).json({
            error: "Too many requests",
            message,
            retryAfter: decision.retryAfter,
          });
        }
      }
      next();
    } catch {
      res.status(503).json({ error: "Request protection is temporarily unavailable. Please try again shortly." });
    }
  };
}

const loginWindowSeconds = config.loginWindowSeconds;
export const loginLimiter = databaseRateLimiter({
  buckets: [
    { key: (req) => `login-ip:${req.ip || "unknown"}`, maxHits: config.loginMaxAttempts * 2, windowSeconds: loginWindowSeconds },
    { key: (req) => `login-email:${String(req.body?.email || "").trim().toLowerCase() || "missing"}`, maxHits: config.loginMaxAttempts, windowSeconds: loginWindowSeconds },
  ],
  message: "Too many sign-in attempts. Wait before trying again.",
});

export const setupLimiter = databaseRateLimiter({
  buckets: [{ key: (req) => `setup-ip:${req.ip || "unknown"}`, maxHits: 3, windowSeconds: 3600 }],
  message: "Administrator setup attempts are temporarily limited. Please wait before trying again.",
});

export const contactLimiter = databaseRateLimiter({
  buckets: [{ key: (req) => `contact:${req.ip || "unknown"}`, maxHits: config.contactMaxAttempts, windowSeconds: config.contactWindowSeconds }],
  message: "Too many contact submissions. Please try again later.",
});

export const recoveryLimiter = databaseRateLimiter({
  buckets: [
    { key: (req) => `recovery-ip:${req.ip || "unknown"}`, maxHits: 5, windowSeconds: 900 },
    { key: (req) => `recovery-email:${String(req.body?.email || "").trim().toLowerCase() || "missing"}`, maxHits: 3, windowSeconds: 900 },
  ],
  message: "Too many recovery requests. Please wait before trying again.",
});
