/**
 * TL;DV ADMIN ROUTES
 *
 * Endpoints for managing tl;dv integration settings per client.
 * All routes require admin authentication (ADMIN_API_KEY).
 *
 * Endpoints:
 *   PATCH  /admin/tldv/:clientId           — Save tl;dv API key + set provider
 *   POST   /admin/tldv/:clientId/test      — Validate API key against tl;dv API
 *   GET    /admin/tldv/:clientId/status     — Get tl;dv integration status
 */

const express = require('express');
const router = express.Router();
const webhookAuth = require('../../middleware/webhookAuth');
const clientQueries = require('../../db/queries/clients');
const tldvAPI = require('../../services/transcript/TldvAPI');
const auditLogger = require('../../utils/AuditLogger');
const logger = require('../../utils/logger');
const config = require('../../config');

// All tl;dv admin routes require admin auth
router.use(webhookAuth.admin);

// PATCH /admin/tldv/:clientId — Save tl;dv API key and set transcript_provider
router.patch('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { tldv_api_key, transcript_provider } = req.body;

  try {
    const existing = await clientQueries.findById(clientId);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    const updates = {};
    if (tldv_api_key !== undefined) {
      updates.tldv_api_key = tldv_api_key;
    }
    if (transcript_provider !== undefined) {
      const validProviders = ['fathom', 'tldv', null];
      if (!validProviders.includes(transcript_provider)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid transcript_provider. Must be one of: ${validProviders.filter(Boolean).join(', ')}`,
        });
      }
      updates.transcript_provider = transcript_provider;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No fields to update' });
    }

    await clientQueries.update(clientId, updates);

    await auditLogger.log({
      clientId,
      entityType: 'client',
      entityId: clientId,
      action: 'updated',
      triggerSource: 'admin',
      triggerDetail: 'tldv_config',
      metadata: { fields_updated: Object.keys(updates) },
    });

    const baseUrl = config.server.baseUrl;

    res.status(200).json({
      status: 'ok',
      transcript_provider: updates.transcript_provider || existing.transcript_provider,
      webhook_url: `${baseUrl}/webhooks/transcript/tldv`,
      setup_instructions: [
        'Go to tl;dv Settings → Webhooks',
        `Add webhook URL: ${baseUrl}/webhooks/transcript/tldv`,
        `Add custom header: X-Client-Id: ${clientId}`,
        'Set scope to Team or Organization',
        'Enable both MeetingReady and TranscriptReady events',
      ],
    });
  } catch (error) {
    logger.error('Failed to update tl;dv config', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update tl;dv config' });
  }
});

// POST /admin/tldv/:clientId/test — Test the tl;dv API key
router.post('/:clientId/test', async (req, res) => {
  const { clientId } = req.params;

  try {
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    // Use API key from request body or from stored config
    const apiKey = req.body.tldv_api_key || client.tldv_api_key;
    if (!apiKey) {
      return res.status(400).json({
        status: 'error',
        message: 'No tl;dv API key provided or stored',
      });
    }

    const validation = await tldvAPI.validateApiKey(apiKey);

    res.status(200).json({
      status: 'ok',
      valid: validation.valid,
      error: validation.error || null,
    });
  } catch (error) {
    logger.error('Failed to test tl;dv API key', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to test API key' });
  }
});

// GET /admin/tldv/:clientId/status — Check tl;dv integration status
router.get('/:clientId/status', async (req, res) => {
  const { clientId } = req.params;

  try {
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    const baseUrl = config.server.baseUrl;

    res.status(200).json({
      status: 'ok',
      configured: !!client.tldv_api_key,
      transcript_provider: client.transcript_provider || null,
      webhook_url: `${baseUrl}/webhooks/transcript/tldv`,
    });
  } catch (error) {
    logger.error('Failed to get tl;dv status', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to get tl;dv status' });
  }
});

module.exports = router;
