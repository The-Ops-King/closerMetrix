/**
 * CLIENT ISOLATION MIDDLEWARE
 *
 * Resolves the X-Client-Token header to a client_id + plan_tier.
 * Injects client context into req so downstream routes can use it.
 *
 * This is the FIRST LINE OF DEFENSE for client data isolation.
 * Every /api/dashboard/* route uses this middleware.
 *
 * TWO AUTH PATHS:
 *   1. Normal client: X-Client-Token → validate token → resolve client
 *   2. Admin view:    X-Admin-Key + X-View-Client-Id → verify admin → resolve client by ID
 *      This lets admins view any client's dashboard through the same endpoints.
 *
 * After this middleware runs, req will have:
 *   req.clientId    - The authenticated client's ID
 *   req.tier        - The client's plan tier ('basic', 'insight', 'executive')
 *   req.companyName - The company name
 *   req.closers     - Array of { closer_id, name }
 *   req.isDemo      - True if using a demo token
 *   req.isAdmin     - True if admin is viewing this client
 */

const crypto = require('crypto');
const config = require('../config');
const tokenManager = require('../utils/tokenManager');
const logger = require('../utils/logger');

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Express middleware: resolve client token → client context.
 * Supports two auth modes:
 *   1. Client token (X-Client-Token header)
 *   2. Admin view (X-Admin-Key + X-View-Client-Id headers)
 */
async function clientIsolation(req, res, next) {
  const token = req.headers['x-client-token'];
  const adminKey = req.headers['x-admin-key'];
  const viewClientId = req.headers['x-view-client-id'];

  // ── Admin viewing a client's dashboard ──────────────────────
  // When an admin provides their API key + a client ID to view,
  // bypass the normal token flow and resolve the client directly.
  // This allows the admin panel to render any client's dashboard
  // using the same /api/dashboard/* endpoints.
  if (adminKey && viewClientId) {
    if (!safeCompare(adminKey, config.adminApiKey)) {
      logger.warn('Invalid admin key in client view attempt', { ip: req.ip });
      return res.status(403).json({
        success: false,
        error: 'Invalid admin key',
      });
    }

    try {
      const clientRecord = await tokenManager.getClientById(viewClientId);

      if (!clientRecord) {
        return res.status(404).json({
          success: false,
          error: 'Client not found',
        });
      }

      // Inject client context from admin-provided client ID
      req.clientId = clientRecord.client_id;
      req.tier = clientRecord.plan_tier;
      req.companyName = clientRecord.company_name;
      req.closers = clientRecord.closers || [];
      req.isAdmin = true;
      req.isDemo = viewClientId.startsWith('demo');

      logger.debug('Admin viewing client dashboard', {
        clientId: req.clientId,
        tier: req.tier,
      });

      return next();
    } catch (err) {
      logger.error('Admin client view failed', { error: err.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to resolve client',
      });
    }
  }

  // ── Normal client token flow ────────────────────────────────
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Missing X-Client-Token header',
    });
  }

  // Check if this is a demo token
  const isDemo = token.startsWith('demo');

  try {
    const clientRecord = await tokenManager.validateToken(token);

    if (!clientRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired access token',
      });
    }

    // Inject client context into the request
    req.clientId = clientRecord.client_id;
    req.tier = clientRecord.plan_tier;
    req.companyName = clientRecord.company_name;
    req.closers = clientRecord.closers;
    req.isDemo = isDemo;

    logger.debug('Client authenticated', {
      clientId: req.clientId,
      tier: req.tier,
      isDemo,
    });

    next();
  } catch (err) {
    logger.error('Client isolation middleware error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

module.exports = clientIsolation;
