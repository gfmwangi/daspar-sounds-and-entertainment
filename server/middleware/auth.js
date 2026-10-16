import { db } from "../db/database.js";

/**
 * Middleware ensuring the request has an active authenticated administrator session.
 */
export function requireAdmin(req, res, next) {
  // Check cookie or Authorization header
  const token = req.cookies?.daspar_session || req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
      message: "No active administrator session was found.",
    });
  }

  const session = db.getSession(token);
  if (!session) {
    return res.status(401).json({
      error: "Session expired or invalid",
      message: "Please sign in again to access the administrator dashboard.",
    });
  }

  req.adminSession = session;
  req.adminEmail = session.adminEmail;
  next();
}
