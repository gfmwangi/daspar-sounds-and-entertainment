/**
 * Lightweight, zero-dependency in-memory rate limiter middleware factory.
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxAttempts - Max allowed requests within the window
 * @param {string} message - Error message on limit exceeded
 */
export function rateLimiter({ windowMs, maxAttempts, message }) {
  const store = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();

    const record = store.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    store.set(ip, record);

    // Periodically prune stale entries
    if (store.size > 1000) {
      for (const [key, val] of store.entries()) {
        if (now > val.resetTime) store.delete(key);
      }
    }

    if (record.count > maxAttempts) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: "Too many requests",
        message: message || "Too many requests. Please try again later.",
        retryAfter: retryAfterSec,
      });
    }

    next();
  };
}

// Pre-configured limiters
export const loginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5,
  message: "Too many sign-in attempts from this location. Please try again in 15 minutes.",
});

export const contactLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxAttempts: 5,
  message: "Too many contact submissions sent. Please try again shortly.",
});
