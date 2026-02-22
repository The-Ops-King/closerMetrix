/**
 * REQUEST LOGGER
 *
 * Logs all incoming HTTP requests with method, path, status code, and
 * response time. Uses Morgan for HTTP logging piped into Winston.
 *
 * In production: logs as JSON for Cloud Run's logging agent.
 * In development: logs as colorized one-liners for readability.
 */

const morgan = require('morgan');
const logger = require('../utils/logger');

// Custom Morgan token for Winston integration
const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Use 'combined' format in production for full request details,
// 'dev' format in development for concise colorized output.
const format = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';

module.exports = morgan(format, {
  stream,
  // Skip health check logs to avoid noise
  skip: (req) => req.path === '/admin/health' || req.path === '/',
});
