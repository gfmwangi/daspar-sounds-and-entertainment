import { config } from "../config.js";
import { db } from "../db/database.js";

export const COOKIE_NAME = "daspar_session";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
    path: "/",
  };
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
  });
}

export function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) {
    if (config.isProduction) return res.status(403).json({ error: "A trusted website origin is required." });
    return next();
  }
  if (!config.corsOrigins.includes(origin)) {
    return res.status(403).json({ error: "This website origin is not allowed." });
  }
  next();
}

export async function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Authentication required", message: "Sign in to access administrator tools." });
  }
  try {
    const session = await db.getSession(token);
    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired or invalid", message: "Please sign in again." });
    }
    req.adminSession = session;
    req.adminId = session.adminId;
    req.adminEmail = session.adminEmail;
    next();
  } catch {
    res.status(503).json({ error: "Administrator services are temporarily unavailable." });
  }
}
