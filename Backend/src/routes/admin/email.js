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
const { renderWeeklyReport, renderMonthlyReport, renderDailyOnboardingReport, ALL_SECTIONS } = require('../../services/email/EmailTemplateEngine');
const emailService = require('../../services/email/EmailService');
const { weeklyTestData, monthlyTestData, dailyOnboardingTestData } = require('../../services/email/testData');
const { sendWeeklyReports, sendMonthlyReports, sendReportForClient } = require('../../services/email/EmailScheduler');
const { sendOnboardingReportForCloser } = require('../../services/email/EmailScheduler');
const { fetchEmailData, fetchDailyOnboardingData } = require('../../services/email/EmailDataFetcher');
const { generateInsights } = require('../../services/email/EmailInsightGenerator');
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
  } else if (type === 'daily-onboarding') {
    html = renderDailyOnboardingReport(dailyOnboardingTestData, { livePreview: true, baseUrl });
  } else {
    return res.status(400).json({ status: 'error', message: `Invalid type: ${type}. Use "weekly", "monthly", or "daily-onboarding".` });
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

/**
 * GET /admin/email/preview-live/weekly?client_id=himym
 * GET /admin/email/preview-live/monthly?client_id=himym
 *
 * Renders HTML in browser using REAL BigQuery data + AI insights.
 * No email sent — just renders in the browser for fast iteration.
 *
 * Query params:
 *   ?client_id=xxx (required) — Which client to fetch data for
 *   ?sections=overview,financial — Only render these sections
 *   ?skip_ai=true — Skip AI insight generation (faster, shows data only)
 */
router.get('/preview-live/:type', previewAuth, async (req, res) => {
  const { type } = req.params;
  const { client_id, skip_ai } = req.query;
  const sections = parseSections(req.query.sections);

  if (!client_id) {
    return res.status(400).json({ status: 'error', message: 'client_id query param is required' });
  }
  if (type === 'daily-onboarding') {
    // Delegate to the daily onboarding handler
    const { closer_id, date } = req.query;
    if (!closer_id) {
      return res.status(400).json({ status: 'error', message: 'closer_id query param is required for daily-onboarding' });
    }
    try {
      const data = await fetchDailyOnboardingData(client_id, closer_id, date || null);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const html = renderDailyOnboardingReport(data, { livePreview: true, baseUrl });
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch (error) {
      logger.error('Daily onboarding live preview failed', { client_id, closer_id: req.query.closer_id, error: error.message });
      return res.status(500).json({ status: 'error', message: error.message, stack: error.stack });
    }
  }

  if (type !== 'weekly' && type !== 'monthly') {
    return res.status(400).json({ status: 'error', message: `Invalid type: ${type}. Use "weekly", "monthly", or "daily-onboarding".` });
  }

  try {
    const data = await fetchEmailData(client_id, type);

    if (skip_ai !== 'true') {
      const insights = await generateInsights(data, sections);
      data.insights = insights;
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const renderFn = type === 'monthly' ? renderMonthlyReport : renderWeeklyReport;
    const html = renderFn(data, sections.length > 0 ? sections : undefined, { livePreview: true, baseUrl });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error('Live preview failed', { type, client_id, error: error.message });
    res.status(500).json({ status: 'error', message: error.message, stack: error.stack });
  }
});

/**
 * GET /admin/email/preview-data/weekly?client_id=himym
 * GET /admin/email/preview-data/monthly?client_id=himym
 *
 * Returns the RAW JSON data from EmailDataFetcher — for debugging.
 * Use this to find undefined/missing values before they hit the template.
 */
router.get('/preview-data/:type', previewAuth, async (req, res) => {
  const { type } = req.params;
  const { client_id } = req.query;

  if (!client_id) {
    return res.status(400).json({ status: 'error', message: 'client_id query param is required' });
  }
  if (type !== 'weekly' && type !== 'monthly') {
    return res.status(400).json({ status: 'error', message: `Invalid type: ${type}. Use "weekly" or "monthly".` });
  }

  try {
    const data = await fetchEmailData(client_id, type);
    res.json({ status: 'ok', data });
  } catch (error) {
    logger.error('Preview data failed', { type, client_id, error: error.message });
    res.status(500).json({ status: 'error', message: error.message, stack: error.stack });
  }
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

// ── Daily Onboarding Routes ──────────────────────────────────

/**
 * GET /admin/email/preview-live/daily-onboarding?client_id=xxx&closer_id=xxx
 *
 * Renders daily onboarding email with real BigQuery data.
 * Query params:
 *   ?client_id=xxx (required)
 *   ?closer_id=xxx (required)
 *   ?date=2026-03-07 (optional, defaults to today)
 */
router.get('/preview-live/daily-onboarding', previewAuth, async (req, res) => {
  const { client_id, closer_id, date } = req.query;

  if (!client_id || !closer_id) {
    return res.status(400).json({ status: 'error', message: 'client_id and closer_id query params are required' });
  }

  try {
    const data = await fetchDailyOnboardingData(client_id, closer_id, date || null);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const html = renderDailyOnboardingReport(data, { livePreview: true, baseUrl });

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error('Daily onboarding live preview failed', { client_id, closer_id, error: error.message });
    res.status(500).json({ status: 'error', message: error.message, stack: error.stack });
  }
});

/**
 * POST /admin/email/trigger/daily-onboarding?client_id=xxx&closer_id=xxx&to=email
 *
 * Manually triggers a daily onboarding email send.
 * Uses real BigQuery data. Optional ?to= overrides recipient.
 */
router.post('/trigger/daily-onboarding', webhookAuth.admin, async (req, res) => {
  const { client_id, closer_id, to } = req.query;

  if (!client_id || !closer_id) {
    return res.status(400).json({ status: 'error', message: 'client_id and closer_id query params are required' });
  }

  try {
    logger.info('Email trigger: daily onboarding', { client_id, closer_id, to });
    const result = await sendOnboardingReportForCloser(client_id, closer_id, to || null);
    return res.json({ status: result.success ? 'ok' : 'error', ...result });
  } catch (error) {
    logger.error('Daily onboarding trigger failed', { client_id, closer_id, error: error.message });
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
