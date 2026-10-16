import crypto from "node:crypto";

/**
 * Generates a random salt.
 */
export function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Hashes a password using crypto.scryptSync.
 */
export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/**
 * Securely verifies a password against a salt and hash using timingSafeEqual.
 */
export function verifyPassword(password, salt, expectedHash) {
  const actualHash = hashPassword(password, salt);
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Generates a secure random session token.
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
