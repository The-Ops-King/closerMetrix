/**
 * JOB ROUTES — /api/jobs/*
 *
 * Endpoints for scheduled and manual job triggers.
 * Protected by X-Admin-Key header (same as admin routes).
 *
 * Routes:
 *   POST /api/jobs/daily-insights — Trigger daily insight generation for all clients
 */

const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const { runDailyInsights } = require('../jobs/dailyInsights');
const logger = require('../utils/logger');

const router = express.Router();

// All job routes require admin authentication
router.use(adminAuth);

/**
 * POST /api/jobs/daily-insights
 *
 * Triggers the daily insight generation job.
 * Responds immediately and runs the job async (non-blocking).
 *
 * Cloud Scheduler calls this at 2am UTC daily.
 * Can also be triggered manually for testing.
 */
router.post('/daily-insights', (req, res) => {
  logger.info('Daily insights job triggered', { ip: req.ip });

  // Respond immediately — job runs in background
  res.json({
    success: true,
    message: 'Daily insights generation started',
  });

  // Run async — errors are logged but don't affect the response
  runDailyInsights()
    .then(summary => {
      logger.info('Daily insights job finished', summary);
    })
    .catch(err => {
      logger.error('Daily insights job failed', { error: err.message });
    });
});

module.exports = router;
