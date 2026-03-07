/**
 * ADMIN EMAIL ROUTES
 *
 * Preview and test-send email reports.
 * All routes require admin auth except the preview endpoint in development
 * (so Tyler can view it directly in his browser).
 *
 * Routes:
 *   GET  /admin/email/preview/:type   — Renders HTML in browser (live preview)
 *   POST /admin/email/test/:type      — Sends test email to jt@jtylerray.com
 */

const express = require('express');
const router = express.Router();
const webhookAuth = require('../../middleware/webhookAuth');
const config = require('../../config');
const { renderWeeklyReport, renderMonthlyReport, ALL_SECTIONS } = require('../../services/email/EmailTemplateEngine');
const emailService = require('../../services/email/EmailService');
const { weeklyTestData, monthlyTestData } = require('../../services/email/testData');
const { sendWeeklyReports, sendMonthlyReports, sendReportForClient } = require('../../services/email/EmailScheduler');
const logger = require('../../utils/logger');

/**
 * Parses the ?sections= query param into an array.
 * If not provided, returns all sections.
 * Example: ?sections=overview,financial → ['overview', 'financial']
 */
function parseSections(query) {
  if (!query) return ALL_SECTIONS;
  const requested = query.split(',').map(s => s.trim()).filter(Boolean);
  // Only include valid section names
  return requested.filter(s => ALL_SECTIONS.includes(s));
}

/**
 * GET /admin/email/preview/weekly
 * GET /admin/email/preview/monthly
 *
 * Returns rendered HTML directly — open in a browser tab.
 * Injects a 2-second auto-refresh script so edits to the template
 * are visible live (nodemon restarts → page reloads).
 *
 * Query params:
 *   ?sections=overview,financial  — Only render these sections
 */
// Preview is open in development (so Tyler can view in browser), auth-gated in production
const previewAuth = config.server.nodeEnv === 'production' ? webhookAuth.admin : (req, res, next) => next();
router.get('/preview/:type', previewAuth, (req, res) => {
  const { type } = req.params;
  const sections = parseSections(req.query.sections);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  let html;
  if (type === 'weekly') {
    html = renderWeeklyReport(weeklyTestData, sections, { livePreview: true, baseUrl });
  } else if (type === 'monthly') {
    html = renderMonthlyReport(monthlyTestData, sections, { livePreview: true, baseUrl });
  } else {
    return res.status(400).json({ status: 'error', message: `Invalid type: ${type}. Use "weekly" or "monthly".` });
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/**
 * POST /admin/email/test/weekly
 * POST /admin/email/test/monthly
 *
 * Sends a test email to the configured test recipient (jt@jtylerray.com).
 * Uses test data — no BigQuery needed.
 *
 * Query params:
 *   ?sections=overview,financial  — Only include these sections
 */
// Test send always requires admin auth
router.post('/test/:type', webhookAuth.admin, async (req, res) => {
  const { type } = req.params;
  const sections = parseSections(req.query.sections);

  try {
    let result;
    if (type === 'weekly') {
      result = await emailService.sendTestWeekly(sections);
    } else if (type === 'monthly') {
      result = await emailService.sendTestMonthly(sections);
    } else {
      return res.status(400).json({ status: 'error', message: `Invalid type: ${type}. Use "weekly" or "monthly".` });
    }

    logger.info('Test email sent', { type, sections, result });

    res.json({
      status: 'ok',
      type,
      recipient: require('../../config').email.testRecipient,
      sections,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to send test email', { type, error: error.message });
    res.status(500).json({
      status: 'error',
      message: `Failed to send test email: ${error.message}`,
    });
  }
});

/**
 * POST /admin/email/trigger/weekly
 * POST /admin/email/trigger/monthly
 *
 * Triggers real report sends with live BigQuery data + AI insights.
 * Requires admin auth. Optionally pass ?client_id=xxx to send for a single client.
 *
 * Without client_id: sends to ALL eligible clients (weekly_enabled/monthly_enabled = true).
 * With client_id: sends for that single client regardless of their enabled setting.
 */
router.post('/trigger/:type', webhookAuth.admin, async (req, res) => {
  const { type } = req.params;
  const { client_id, to } = req.query;

  if (type !== 'weekly' && type !== 'monthly') {
    return res.status(400).json({ status: 'error', message: `Invalid type: ${type}. Use "weekly" or "monthly".` });
  }

  try {
    let result;

    if (client_id) {
      // Single client send
      logger.info('Email trigger: single client', { type, client_id, to });
      result = await sendReportForClient(client_id, type, to);
      return res.json({ status: result.success ? 'ok' : 'error', ...result });
    }

    // All eligible clients
    logger.info('Email trigger: all eligible clients', { type });
    if (type === 'weekly') {
      result = await sendWeeklyReports();
    } else {
      result = await sendMonthlyReports();
    }

    res.json({ status: 'ok', type, ...result });
  } catch (error) {
    logger.error('Email trigger failed', { type, client_id, error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
