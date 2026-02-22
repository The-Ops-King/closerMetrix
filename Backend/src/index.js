/**
 * CLOSERMETRIX API — ENTRY POINT
 *
 * Starts the Express server. This is the main entry point for the application.
 *
 * In production (Cloud Run): Cloud Run sets PORT=8080 and manages the process.
 * In development: Run with `npm run dev` (nodemon for auto-restart).
 *
 * Usage:
 *   node src/index.js         # Production start
 *   npm run dev               # Development with auto-restart
 */

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const timeoutService = require('./services/TimeoutService');

const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info(`CloserMetrix API started`, {
    port: PORT,
    env: config.server.nodeEnv,
    baseUrl: config.server.baseUrl,
    bigqueryProject: config.bigquery.projectId,
    bigqueryDataset: config.bigquery.dataset,
    aiModel: config.ai.model,
  });

  // Start background jobs
  timeoutService.start();
});

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception — shutting down', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
  });
});
