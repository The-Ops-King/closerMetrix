/**
 * PARTNER AUTH MIDDLEWARE
 *
 * Resolves the X-Partner-Token header to a partner record.
 * Partners can only see their assigned clients (read-only).
 *
 * After this middleware runs, req will have:
 *   req.partnerId          - The partner's identifier
 *   req.assignedClientIds  - Array of client_ids the partner can access
 *   req.isPartner          - true
 */

const tokenManager = require('../utils/tokenManager');
const logger = require('../utils/logger');

/**
 * Express middleware: resolve partner token → partner context.
 * Returns 401 if token is missing or invalid.
 */
async function partnerAuth(req, res, next) {
  const token = req.headers['x-partner-token'];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Missing X-Partner-Token header',
    });
  }

  try {
    const partnerRecord = await tokenManager.validatePartnerToken(token);

    if (!partnerRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired partner token',
      });
    }

    req.partnerId = partnerRecord.partner_id;
    req.assignedClientIds = partnerRecord.assigned_client_ids;
    req.isPartner = true;

    logger.debug('Partner authenticated', {
      partnerId: req.partnerId,
      clientCount: req.assignedClientIds.length,
    });

    next();
  } catch (err) {
    logger.error('Partner auth middleware error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Partner authentication failed',
    });
  }
}

module.exports = partnerAuth;
