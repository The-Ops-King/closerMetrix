/**
 * WEBHOOK AUTHENTICATION MIDDLEWARE
 *
 * Validates that incoming webhook requests are legitimate.
 * Different authentication strategies for different webhook sources.
 *
 * STRATEGIES:
 * - Google Calendar: Validates X-Goog-Channel-Token matches client_id
 * - Transcript providers: Matches closer_email to a closer record (client identification)
 * - Payment webhooks: Validates Authorization header against client's stored webhook_secret
 *
 * Usage:
 *   router.post('/webhooks/payment', webhookAuth.payment, handler);
 *   router.post('/webhooks/calendar/:clientId', webhookAuth.calendar, handler);
 */

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const clientQueries = require('../db/queries/clients');

/**
 * Constant-time string comparison to prevent timing attacks.
 * Hashes both values to fixed length before comparing.
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // Hash to fixed length to avoid leaking length info
  const aHash = crypto.createHash('sha256').update(aBuf).digest();
  const bHash = crypto.createHash('sha256').update(bBuf).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}

const webhookAuth = {
  /**
   * Validates Google Calendar push notification headers.
   * The X-Goog-Channel-Token is set to the client_id during watch setup.
   */
  calendar(req, res, next) {
    const channelToken = req.headers['x-goog-channel-token'];
    const clientId = req.params.clientId;

    if (!channelToken || !safeCompare(channelToken, clientId)) {
      logger.warn('Calendar webhook auth failed', {
        clientId,
        channelToken,
        resourceState: req.headers['x-goog-resource-state'],
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid channel token',
      });
    }

    next();
  },

  /**
   * Validates payment webhook authorization.
   * Expects: Authorization: Bearer {client_webhook_secret}
   * The secret is checked against the client record (loaded by clientIsolation middleware).
   */
  payment(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing Authorization header',
      });
    }

    const token = authHeader.slice(7);

    // req.client is set by clientIsolation middleware (runs before this)
    if (!req.client) {
      return res.status(401).json({
        status: 'error',
        message: 'Client not identified',
      });
    }

    if (!req.client.webhook_secret || !safeCompare(req.client.webhook_secret, token)) {
      logger.warn('Payment webhook auth failed', {
        clientId: req.clientId,
      });
      return res.status(401).json({
        status: 'error',
        message: 'Invalid client_id or unauthorized',
      });
    }

    next();
  },

  /**
   * Identifies the client for a transcript webhook.
   *
   * Transcript webhooks are NOT signed — they carry no secret. The client is
   * identified via the X-Client-Id header (or `client_id` field in the body)
   * purely to give downstream processing a clientIdHint for faster, more
   * accurate matching. When no client_id is present, the request still passes
   * through and the client is resolved later via closer_email.
   *
   * NOTE: webhook_secret is no longer used for transcripts. It remains in use
   * only for the payment webhook (see webhookAuth.payment).
   */
  async transcript(req, res, next) {
    const clientId = req.headers['x-client-id'] || (req.body && req.body.client_id);

    if (!clientId) {
      // No hint — client is resolved downstream via closer_email.
      return next();
    }

    // Best-effort lookup to attach a clientIdHint. Never block ingestion on it.
    try {
      const client = await clientQueries.findById(clientId);
      if (client) {
        req.client = client;
        req.clientId = clientId;
      } else {
        logger.warn('Transcript webhook: unknown client_id — falling back to closer_email resolution', {
          clientId,
          provider: req.params.provider,
        });
      }
    } catch (err) {
      logger.error('Transcript webhook: client lookup failed — continuing without hint', {
        clientId,
        error: err.message,
      });
    }

    next();
  },

  /**
   * Validates admin API endpoints.
   * Accepts admin key from X-Admin-Key header OR Authorization: Bearer {key}.
   * X-Admin-Key is preferred when Cloud Run uses Authorization for service-to-service ID tokens.
   */
  admin(req, res, next) {
    const adminKeyHeader = req.headers['x-admin-key'];
    const authHeader = req.headers.authorization;

    // Prefer X-Admin-Key (used when Cloud Run owns the Authorization header)
    // Fall back to Authorization: Bearer for backward compatibility and direct API calls
    let token;
    if (adminKeyHeader) {
      token = adminKeyHeader;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing admin credentials',
      });
    }

    if (!config.admin.apiKey || !safeCompare(token, config.admin.apiKey)) {
      logger.warn('Admin auth failed', {
        path: req.path,
        method: req.method,
      });
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized',
      });
    }

    next();
  },
};

module.exports = webhookAuth;
