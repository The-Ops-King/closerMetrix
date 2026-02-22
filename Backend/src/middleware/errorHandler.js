/**
 * GLOBAL ERROR HANDLER
 *
 * Catches all unhandled errors in Express route handlers and middleware.
 * Logs the error, sends an alert if severe, and returns a clean JSON response.
 *
 * This is the LAST middleware in the chain — it catches everything that
 * wasn't explicitly handled by the route.
 *
 * IMPORTANT: Express requires the (err, req, res, next) signature with all
 * four parameters for it to be recognized as an error handler.
 */

const logger = require('../utils/logger');
const alertService = require('../utils/AlertService');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;

  // Log the error with request context
  const logData = {
    method: req.method,
    path: req.path,
    statusCode,
    error: err.message,
    stack: isServerError ? err.stack : undefined,
    clientId: req.params?.clientId || req.body?.client_id || null,
  };

  if (isServerError) {
    logger.error('Unhandled server error', logData);

    // Alert for server errors
    alertService.send({
      severity: 'high',
      title: `Server Error: ${req.method} ${req.path}`,
      details: err.message,
      error: err.stack,
      suggestedAction: 'Check server logs for full stack trace',
    });
  } else {
    logger.warn('Client error', logData);
  }

  res.status(statusCode).json({
    status: 'error',
    message: isServerError ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
