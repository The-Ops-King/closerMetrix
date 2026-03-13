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
   * Validates transcript webhook HMAC-SHA256 signature.
   *
   * Supports multiple provider signature headers:
   *   - Fathom:   X-Fathom-Signature
   *   - tl;dv:    X-Tldv-Signature
   *   - Generic:  X-Webhook-Signature
   *
   * The client is identified via X-Client-Id header or `client_id` field in the body.
   * The webhook_secret from the Clients table is used as the HMAC key.
   *
   * Graceful degradation: if a client has no webhook_secret configured,
   * the request is allowed through with a warning (supports rollout period).
   */
  async transcript(req, res, next) {
    // Determine which signature header the provider sent
    const signatureHeader =
      req.headers['x-fathom-signature'] ||
      req.headers['x-tldv-signature'] ||
      req.headers['x-webhook-signature'];

    // Identify the client — from header or body
    const clientId = req.headers['x-client-id'] || (req.body && req.body.client_id);

    if (!clientId) {
      // No client identification — cannot verify. Allow through for
      // backwards compatibility (client is resolved later via closer_email).
      if (!signatureHeader) {
        logger.warn('Transcript webhook: no client_id and no signature — allowing (legacy mode)', {
          provider: req.params.provider,
        });
        return next();
      }
      // Signature present but no client_id to look up secret — reject
      return res.status(401).json({
        status: 'error',
        message: 'Signature provided but no client_id to verify against',
      });
    }

    // Look up the client to get their webhook_secret
    let client;
    try {
      client = await clientQueries.findById(clientId);
    } catch (err) {
      logger.error('Transcript webhook: client lookup failed', {
        clientId,
        error: err.message,
      });
      return res.status(500).json({
        status: 'error',
        message: 'Internal error during authentication',
      });
    }

    if (!client) {
      return res.status(401).json({
        status: 'error',
        message: 'Unknown client_id',
      });
    }

    // Graceful degradation: if client has no webhook_secret, allow through
    // unless TRANSCRIPT_WEBHOOK_ALLOW_UNSIGNED=false in env
    if (!client.webhook_secret) {
      if (config.transcriptWebhook.allowUnsigned) {
        logger.warn('Transcript webhook: client has no webhook_secret configured — allowing (rollout mode)', {
          clientId,
          provider: req.params.provider,
        });
        req.client = client;
        req.clientId = clientId;
        return next();
      }
      return res.status(401).json({
        status: 'error',
        message: 'Client webhook_secret not configured',
      });
    }

    // tl;dv does NOT support HMAC webhook signing — it uses X-Client-Id for auth.
    // Allow tl;dv requests through without a signature if the client is identified.
    if (!signatureHeader && req.params.provider === 'tldv') {
      logger.info('Transcript webhook: tl;dv provider — skipping HMAC (not supported by tl;dv)', {
        clientId,
      });
      req.client = client;
      req.clientId = clientId;
      return next();
    }

    // For other providers: if client has a secret, signature MUST be present
    if (!signatureHeader) {
      logger.warn('Transcript webhook auth failed: no signature header', {
        clientId,
        provider: req.params.provider,
      });
      return res.status(401).json({
        status: 'error',
        message: 'Missing webhook signature header',
      });
    }

    // Compute HMAC-SHA256 of the raw body
    const rawBody = req.rawBody;
    if (!rawBody) {
      logger.error('Transcript webhook: rawBody not available for HMAC verification', {
        clientId,
      });
      return res.status(500).json({
        status: 'error',
        message: 'Internal error: raw body not available',
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', client.webhook_secret)
      .update(rawBody)
      .digest('hex');

    if (!safeCompare(signatureHeader, expectedSignature)) {
      logger.warn('Transcript webhook auth failed: signature mismatch', {
        clientId,
        provider: req.params.provider,
      });
      return res.status(403).json({
        status: 'error',
        message: 'Invalid webhook signature',
      });
    }

    // Signature valid — attach client info for downstream use
    req.client = client;
    req.clientId = clientId;
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
