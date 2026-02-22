/**
 * LOGGER
 *
 * Structured JSON logging via Winston. Every log entry includes a timestamp
 * and is formatted for Cloud Run's logging agent (which parses JSON automatically).
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Call created', { callId, clientId });
 *   logger.error('BigQuery failed', { error: err.message });
 */

const winston = require('winston');
const config = require('../config');

const logger = winston.createLogger({
  level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'closermetrix-api' },
  transports: [
    new winston.transports.Console({
      format: config.server.nodeEnv === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
    }),
  ],
});

module.exports = logger;
