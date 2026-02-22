/**
 * CALENDAR WEBHOOK ROUTE
 *
 * POST /webhooks/calendar/:clientId
 *
 * Called by Google Calendar push notifications when calendar events change.
 * Google sends headers only (no body) — we then fetch the changed events
 * via the Calendar API.
 *
 * IMPORTANT: Always return 200 quickly. Google will retry on non-200 responses
 * and may disable the channel if it gets too many errors. Processing happens
 * asynchronously after the response is sent.
 */

const express = require('express');
const router = express.Router();
const calendarService = require('../../services/calendar/CalendarService');
const alertService = require('../../utils/AlertService');
const logger = require('../../utils/logger');

// POST /webhooks/calendar/:clientId
router.post('/:clientId', (req, res) => {
  const { clientId } = req.params;
  const resourceState = req.headers['x-goog-resource-state'];
  const channelId = req.headers['x-goog-channel-id'];

  logger.info('Calendar webhook received', {
    clientId,
    resourceState,
    channelId,
  });

  // Always return 200 immediately — Google requires this
  res.status(200).json({ status: 'ok' });

  // Process asynchronously after response is sent
  calendarService.processCalendarNotification(clientId, req.headers)
    .then(result => {
      if (result.processed > 0 || result.errors > 0) {
        logger.info('Calendar notification processed', {
          clientId,
          ...result,
        });
      }
    })
    .catch(error => {
      logger.error('Calendar notification processing failed', {
        clientId,
        error: error.message,
      });

      alertService.send({
        severity: 'high',
        title: 'Calendar Webhook Processing Failed',
        details: `Client ${clientId} — ${error.message}`,
        error: error.message,
        suggestedAction: 'Check BigQuery connectivity and calendar API access',
      });
    });
});

module.exports = router;
