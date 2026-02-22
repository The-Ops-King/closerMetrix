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

const config = require('../config');
const logger = require('../utils/logger');

const webhookAuth = {
  /**
   * Validates Google Calendar push notification headers.
   * The X-Goog-Channel-Token is set to the client_id during watch setup.
   */
  calendar(req, res, next) {
    const channelToken = req.headers['x-goog-channel-token'];
    const clientId = req.params.clientId;

    if (!channelToken || channelToken !== clientId) {
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

    if (!req.client.webhook_secret || req.client.webhook_secret !== token) {
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
   * Validates admin API endpoints.
   * Expects: Authorization: Bearer {ADMIN_API_KEY}
   */
  admin(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing Authorization header',
      });
    }

    const token = authHeader.slice(7);

    if (!config.admin.apiKey || token !== config.admin.apiKey) {
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
