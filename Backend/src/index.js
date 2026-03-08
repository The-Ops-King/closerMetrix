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
const cron = require('node-cron');
const { sendWeeklyReports, sendMonthlyReports } = require('./services/email/EmailScheduler');

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

  // Email report scheduling (node-cron)
  // Weekly: Monday 9am EST = 2pm UTC → cron: "0 14 * * 1"
  cron.schedule('0 14 * * 1', async () => {
    logger.info('Cron: Triggering weekly email reports');
    try {
      const result = await sendWeeklyReports();
      logger.info('Cron: Weekly reports complete', result);
    } catch (error) {
      logger.error('Cron: Weekly reports failed', { error: error.message });
    }
  }, { timezone: 'UTC' });

  // Monthly: 1st of month 9am EST = 2pm UTC → cron: "0 14 1 * *"
  cron.schedule('0 14 1 * *', async () => {
    logger.info('Cron: Triggering monthly email reports');
    try {
      const result = await sendMonthlyReports();
      logger.info('Cron: Monthly reports complete', result);
    } catch (error) {
      logger.error('Cron: Monthly reports failed', { error: error.message });
    }
  }, { timezone: 'UTC' });

  logger.info('Email cron jobs scheduled: Weekly (Mon 9am EST), Monthly (1st 9am EST)');
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
