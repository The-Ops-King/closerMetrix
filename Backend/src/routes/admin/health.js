/**
 * HEALTH CHECK & DIAGNOSTIC ROUTES
 *
 * GET  /admin/health — System health (no auth required for Cloud Run health checks)
 * GET  /admin/costs — AI cost summary (admin auth required)
 * GET  /admin/audit/:entityType/:entityId — Audit trail (admin auth required)
 * POST /admin/jobs/check-timeouts — Run timeout check (admin auth required)
 */

const express = require('express');
const router = express.Router();
const bq = require('../../db/BigQueryClient');
const costTracker = require('../../utils/CostTracker');
const auditLogger = require('../../utils/AuditLogger');
const timeoutService = require('../../services/TimeoutService');
const webhookAuth = require('../../middleware/webhookAuth');
const calendarPush = require('../../services/calendar/GoogleCalendarPush');
const closerQueries = require('../../db/queries/closers');

/**
 * GET /admin/health
 *
 * System health check. No auth required — Cloud Run uses this
 * to verify the container is running and responsive.
 */
router.get('/health', async (req, res) => {
  const bigqueryOk = await bq.healthCheck();

  const health = {
    status: bigqueryOk ? 'healthy' : 'degraded',
    bigquery: bigqueryOk ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  res.status(bigqueryOk ? 200 : 503).json(health);
});

/**
 * GET /admin/costs
 *
 * AI cost summary for a time period.
 * Query params: ?period=today|week|month&client_id=xxx
 */
router.get('/costs', webhookAuth.admin, async (req, res, next) => {
  try {
    const period = req.query.period || 'today';
    const clientId = req.query.client_id || null;
    const summary = await costTracker.getSummary(period, clientId);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/audit/:entityType/:entityId
 *
 * Retrieves the full audit trail for a specific entity.
 */
router.get('/audit/:entityType/:entityId', webhookAuth.admin, async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;
    const trail = await auditLogger.getTrail(entityType, entityId);
    res.status(200).json({
      entity_type: entityType,
      entity_id: entityId,
      trail,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/jobs/check-timeouts
 *
 * Manually triggers the timeout check for all active clients.
 * In production, Cloud Scheduler calls this every 30 minutes.
 *
 * Returns a summary of what was processed and how many calls timed out.
 */
router.post('/jobs/check-timeouts', webhookAuth.admin, async (req, res, next) => {
  try {
    const result = await timeoutService.checkAllClients();
    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/calendar/channels
 *
 * Returns active push notification channels and their expiry dates.
 */
router.get('/calendar/channels', webhookAuth.admin, async (req, res) => {
  const stats = calendarPush.getChannelStats();
  const channels = [];
  for (const [channelId, data] of calendarPush.channels) {
    channels.push({
      channelId,
      closerEmail: data.closerEmail,
      clientId: data.clientId,
      expiration: data.expiration ? data.expiration.toISOString() : null,
    });
  }
  res.status(200).json({ ...stats, channels });
});

/**
 * POST /admin/calendar/watch/:clientId/:closerId
 *
 * Creates a calendar watch for a specific closer.
 * Used during onboarding to set up push notifications.
 */
router.post('/calendar/watch/:clientId/:closerId', webhookAuth.admin, async (req, res, next) => {
  try {
    const { clientId, closerId } = req.params;
    const closer = await closerQueries.findById(closerId, clientId);
    if (!closer) {
      return res.status(404).json({ status: 'error', message: 'Closer not found' });
    }
    if (!closer.work_email) {
      return res.status(400).json({ status: 'error', message: 'Closer has no work_email set' });
    }
    const channel = await calendarPush.createWatch(closer.work_email, clientId);
    res.status(201).json({ status: 'ok', channel });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/calendar/renew
 *
 * Force-renews all calendar channels that are expiring within 48 hours.
 */
router.post('/calendar/renew', webhookAuth.admin, async (req, res, next) => {
  try {
    const expiring = calendarPush.getExpiringChannels(48);
    const results = [];
    for (const ch of expiring) {
      try {
        const renewed = await calendarPush.renewWatch(ch.channelId);
        results.push({ channelId: ch.channelId, status: 'renewed', newChannelId: renewed?.channelId });
      } catch (error) {
        results.push({ channelId: ch.channelId, status: 'failed', error: error.message });
      }
    }
    res.status(200).json({ status: 'ok', renewed: results.length, results });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
