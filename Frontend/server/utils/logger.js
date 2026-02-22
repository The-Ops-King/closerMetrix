/**
 * STRUCTURED LOGGER
 * Simple structured logger that outputs JSON in production and readable format in dev.
 * Replace with winston/pino later if needed — this is intentionally minimal.
 */

const config = require('../config');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[config.logLevel] ?? LOG_LEVELS.info;

/**
 * Log a message with structured data.
 * @param {'error'|'warn'|'info'|'debug'} level
 * @param {string} message
 * @param {object} [data] - Additional structured data
 */
function log(level, message, data = {}) {
  if ((LOG_LEVELS[level] ?? 2) > currentLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };

  if (config.isDev) {
    // Readable format for development
    const prefix = { error: 'ERROR', warn: 'WARN ', info: 'INFO ', debug: 'DEBUG' }[level];
    const extra = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${prefix}] ${message}${extra}`);
  } else {
    // JSON for production (Cloud Run logs)
    console.log(JSON.stringify(entry));
  }
}

module.exports = {
  error: (msg, data) => log('error', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  info: (msg, data) => log('info', msg, data),
  debug: (msg, data) => log('debug', msg, data),
};
