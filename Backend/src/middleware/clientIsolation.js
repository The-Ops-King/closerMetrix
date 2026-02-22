/**
 * CLIENT ISOLATION MIDDLEWARE
 *
 * Ensures that every request touching client-scoped data has a valid client_id.
 * This is the first line of defense against cross-client data leakage.
 *
 * HOW IT WORKS:
 * 1. Extracts client_id from route params, query string, or request body
 * 2. Validates the client exists in BigQuery
 * 3. Attaches the validated client record to req.client
 * 4. Rejects requests with missing or invalid client_id
 *
 * WHICH ROUTES USE THIS:
 * - All webhook routes (calendar, transcript, payment)
 * - All admin routes that operate on a specific client
 * - NOT health check, NOT client listing
 *
 * Usage in routes:
 *   router.post('/webhooks/calendar/:clientId', clientIsolation, handler);
 *   // req.client is now available in the handler
 */

const clientQueries = require('../db/queries/clients');
const logger = require('../utils/logger');

async function clientIsolation(req, res, next) {
  // Extract client_id from multiple possible locations
  const clientId = req.params.clientId
    || req.body?.client_id
    || req.query?.client_id;

  if (!clientId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required client_id',
    });
  }

  try {
    const client = await clientQueries.findById(clientId);

    if (!client) {
      logger.warn('Request with unknown client_id', {
        clientId,
        path: req.path,
        method: req.method,
      });
      return res.status(404).json({
        status: 'error',
        message: 'Client not found',
      });
    }

    // Attach validated client to the request object
    req.client = client;
    req.clientId = clientId;
    next();
  } catch (error) {
    logger.error('Client isolation lookup failed', {
      clientId,
      error: error.message,
    });
    next(error);
  }
}

module.exports = clientIsolation;
