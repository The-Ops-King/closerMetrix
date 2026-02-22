/**
 * ADMIN AUTH MIDDLEWARE
 *
 * Checks the X-Admin-Key header against the server's ADMIN_API_KEY.
 * This is Tyler-only access — protects all /api/admin/* routes.
 *
 * The admin key is:
 *   - Set via ADMIN_API_KEY env var in production
 *   - Defaults to 'dev-admin-key' in development (see config/index.js)
 *   - Stored in sessionStorage on the frontend after login
 *   - Sent as X-Admin-Key header on every admin API request
 */

const config = require('../config');
const logger = require('../utils/logger');

/**
 * Express middleware: verify admin API key.
 * Returns 401 if missing, 403 if invalid.
 */
function adminAuth(req, res, next) {
  const apiKey = req.headers['x-admin-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing X-Admin-Key header',
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!safeCompare(apiKey, config.adminApiKey)) {
    logger.warn('Invalid admin API key attempt', {
      ip: req.ip,
    });
    return res.status(403).json({
      success: false,
      error: 'Invalid admin API key',
    });
  }

  // Mark request as admin-authenticated
  req.isAdmin = true;
  next();
}

/**
 * Constant-time string comparison.
 * Prevents timing attacks on API key validation.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const crypto = require('crypto');
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = adminAuth;
