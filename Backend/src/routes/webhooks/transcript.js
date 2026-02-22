/**
 * TRANSCRIPT WEBHOOK ROUTE
 *
 * POST /webhooks/transcript/:provider
 *
 * Called by Fathom, tl;dv, Otter, Read.ai, Grain, Gong, or any generic
 * transcript provider when a recording/transcript is ready.
 *
 * Each provider sends a different payload format. The appropriate adapter
 * normalizes it into our StandardTranscript format.
 *
 * IMPORTANT: Always return 200 quickly. Transcript providers may retry
 * on non-200 responses. Processing happens asynchronously after the
 * response is sent.
 */

const express = require('express');
const router = express.Router();
const transcriptProviders = require('../../config/transcript-providers');
const transcriptService = require('../../services/transcript/TranscriptService');
const alertService = require('../../utils/AlertService');
const logger = require('../../utils/logger');

// Validate that the provider in the URL is known
const validProviders = new Set(transcriptProviders.map(p => p.webhookPath));

// POST /webhooks/transcript/:provider
router.post('/:provider', (req, res) => {
  const { provider } = req.params;

  if (!validProviders.has(provider)) {
    logger.warn('Transcript webhook from unknown provider', { provider });
    return res.status(400).json({
      status: 'error',
      message: `Unknown transcript provider: ${provider}`,
    });
  }

  logger.info('Transcript webhook received', {
    provider,
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
  });

  // Always return 200 immediately
  res.status(200).json({ status: 'ok', processing: true });

  // Process asynchronously after response is sent
  transcriptService.processTranscriptWebhook(provider, req.body)
    .then(result => {
      logger.info('Transcript webhook processed', {
        provider,
        action: result.action,
        callId: result.callRecord?.call_id || null,
      });
    })
    .catch(error => {
      logger.error('Transcript webhook processing failed', {
        provider,
        error: error.message,
      });

      alertService.send({
        severity: 'high',
        title: 'Transcript Webhook Processing Failed',
        details: `Provider: ${provider} — ${error.message}`,
        error: error.message,
        suggestedAction: 'Check BigQuery connectivity and closer records',
      });
    });
});

module.exports = router;
