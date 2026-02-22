/**
 * CLOSER ADMIN ROUTES
 *
 * CRUD operations for closer management within a client.
 * All routes require admin authentication (ADMIN_API_KEY).
 *
 * Endpoints:
 *   GET    /admin/clients/:clientId/closers                          — List closers for a client
 *   POST   /admin/clients/:clientId/closers                          — Add closer to a client
 *   PUT    /admin/clients/:clientId/closers/:closerId                — Update closer
 *   DELETE /admin/clients/:clientId/closers/:closerId                — Deactivate closer
 *   PATCH  /admin/clients/:clientId/closers/:closerId/reactivate     — Reactivate closer
 */

const express = require('express');
const router = express.Router();
const webhookAuth = require('../../middleware/webhookAuth');
const clientQueries = require('../../db/queries/clients');
const closerQueries = require('../../db/queries/closers');
const fathomAPI = require('../../services/transcript/FathomAPI');
const auditLogger = require('../../utils/AuditLogger');
const { generateId } = require('../../utils/idGenerator');
const logger = require('../../utils/logger');

// All closer admin routes require admin auth
router.use(webhookAuth.admin);

// GET /admin/clients/:clientId/closers — List closers for a client
router.get('/clients/:clientId/closers', async (req, res) => {
  const { clientId } = req.params;
  const { includeInactive } = req.query;

  try {
    // Validate client exists
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    const closers = includeInactive === 'true'
      ? await closerQueries.listAllByClient(clientId)
      : await closerQueries.listByClient(clientId);

    res.status(200).json({ closers });
  } catch (error) {
    logger.error('Failed to list closers', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to list closers' });
  }
});

// POST /admin/clients/:clientId/closers — Add closer to a client
router.post('/clients/:clientId/closers', async (req, res) => {
  const { clientId } = req.params;

  // Validate required fields
  if (!req.body.name) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required field: name',
    });
  }
  if (!req.body.work_email) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required field: work_email',
    });
  }

  try {
    // Validate client exists
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    // Check for duplicate work_email within this client
    const exists = await closerQueries.existsByWorkEmail(req.body.work_email, clientId);
    if (exists) {
      return res.status(409).json({
        status: 'error',
        message: `A closer with email ${req.body.work_email} already exists for this client`,
      });
    }

    const closerId = generateId();
    const now = new Date().toISOString();

    const transcriptProvider = req.body.transcript_provider || client.transcript_provider || 'fathom';

    const closerData = {
      closer_id: closerId,
      client_id: clientId,
      name: req.body.name,
      work_email: req.body.work_email,
      personal_email: req.body.personal_email || null,
      phone: req.body.phone || null,
      timezone: req.body.timezone || client.timezone || null,
      transcript_provider: transcriptProvider,
      transcript_api_key: req.body.transcript_api_key || null,
      status: 'active',
      created_at: now,
      last_modified: now,
    };

    // If Fathom closer with an API key, register the webhook automatically
    let fathomWebhook = null;
    if (transcriptProvider === 'fathom' && req.body.transcript_api_key) {
      try {
        fathomWebhook = await fathomAPI.registerWebhook(req.body.transcript_api_key);
        closerData.fathom_webhook_id = fathomWebhook.id;
        closerData.fathom_webhook_secret = fathomWebhook.secret;

        logger.info('Fathom webhook auto-registered for closer', {
          closerId,
          webhookId: fathomWebhook.id,
        });
      } catch (error) {
        // Webhook registration failed — still create the closer,
        // but warn that the webhook needs to be set up manually.
        logger.error('Fathom webhook registration failed during onboarding', {
          closerId,
          error: error.message,
        });
      }
    }

    await closerQueries.create(closerData);

    await auditLogger.log({
      clientId,
      entityType: 'closer',
      entityId: closerId,
      action: 'created',
      newValue: req.body.work_email,
      triggerSource: 'admin',
      triggerDetail: 'closer_onboarding',
      metadata: {
        fathom_webhook_registered: !!fathomWebhook,
        fathom_webhook_id: fathomWebhook?.id || null,
      },
    });

    logger.info('Closer added', {
      closerId,
      clientId,
      name: req.body.name,
      workEmail: req.body.work_email,
      fathomWebhookRegistered: !!fathomWebhook,
    });

    const responseMsg = fathomWebhook
      ? `Closer added. Fathom webhook registered automatically. Calendar watch will be created for ${req.body.work_email} when calendar sharing is confirmed.`
      : req.body.transcript_api_key
        ? `Closer added. Fathom webhook registration failed — set up manually in Fathom settings. Calendar watch pending for ${req.body.work_email}.`
        : `Closer added. Provide transcript_api_key to auto-register Fathom webhook. Calendar watch pending for ${req.body.work_email}.`;

    res.status(201).json({
      status: 'ok',
      closer_id: closerId,
      calendar_watch_status: 'pending',
      fathom_webhook_status: fathomWebhook ? 'registered' : (req.body.transcript_api_key ? 'failed' : 'not_configured'),
      fathom_webhook_id: fathomWebhook?.id || null,
      message: responseMsg,
    });
  } catch (error) {
    logger.error('Failed to add closer', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to add closer' });
  }
});

// DELETE /admin/clients/:clientId/closers/:closerId — Deactivate closer
router.delete('/clients/:clientId/closers/:closerId', async (req, res) => {
  const { clientId, closerId } = req.params;

  try {
    // Validate client exists
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    // Validate closer exists
    const closer = await closerQueries.findById(closerId, clientId);
    if (!closer) {
      return res.status(404).json({ status: 'error', message: 'Closer not found' });
    }

    if (closer.status === 'inactive') {
      return res.status(400).json({
        status: 'error',
        message: 'Closer is already deactivated',
      });
    }

    // If closer has a Fathom webhook, delete it
    if (closer.fathom_webhook_id && closer.transcript_api_key) {
      try {
        await fathomAPI.deleteWebhook(closer.transcript_api_key, closer.fathom_webhook_id);
        logger.info('Fathom webhook deleted for deactivated closer', {
          closerId,
          webhookId: closer.fathom_webhook_id,
        });
      } catch (error) {
        // Non-fatal — closer is still deactivated
        logger.error('Failed to delete Fathom webhook during closer deactivation', {
          closerId,
          webhookId: closer.fathom_webhook_id,
          error: error.message,
        });
      }
    }

    // Deactivate (NOT delete — historical data is preserved)
    await closerQueries.update(closerId, clientId, { status: 'inactive' });

    await auditLogger.log({
      clientId,
      entityType: 'closer',
      entityId: closerId,
      action: 'deactivated',
      fieldChanged: 'status',
      oldValue: 'active',
      newValue: 'inactive',
      triggerSource: 'admin',
      triggerDetail: 'closer_removal',
    });

    logger.info('Closer deactivated', {
      closerId,
      clientId,
      name: closer.name,
      workEmail: closer.work_email,
    });

    res.status(200).json({
      status: 'ok',
      action: 'deactivated',
      message: 'Closer deactivated. Calendar watch stopped. Historical data preserved.',
    });
  } catch (error) {
    logger.error('Failed to deactivate closer', { clientId, closerId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to deactivate closer' });
  }
});

// PUT /admin/clients/:clientId/closers/:closerId — Update closer
router.put('/clients/:clientId/closers/:closerId', async (req, res) => {
  const { clientId, closerId } = req.params;

  try {
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    const closer = await closerQueries.findById(closerId, clientId);
    if (!closer) {
      return res.status(404).json({ status: 'error', message: 'Closer not found' });
    }

    // Prevent updating immutable fields
    const immutableFields = ['closer_id', 'client_id', 'created_at'];
    const updates = { ...req.body };
    for (const field of immutableFields) {
      delete updates[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No updatable fields provided' });
    }

    await closerQueries.update(closerId, clientId, updates);

    await auditLogger.log({
      clientId,
      entityType: 'closer',
      entityId: closerId,
      action: 'updated',
      triggerSource: 'admin',
      triggerDetail: 'closer_update',
      metadata: { fields_updated: Object.keys(updates) },
    });

    logger.info('Closer updated', { closerId, clientId, fields: Object.keys(updates) });

    const updated = await closerQueries.findById(closerId, clientId);
    res.status(200).json(updated);
  } catch (error) {
    logger.error('Failed to update closer', { clientId, closerId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update closer' });
  }
});

// PATCH /admin/clients/:clientId/closers/:closerId/reactivate — Reactivate an inactive closer
router.patch('/clients/:clientId/closers/:closerId/reactivate', async (req, res) => {
  const { clientId, closerId } = req.params;

  try {
    const client = await clientQueries.findById(clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    const closer = await closerQueries.findById(closerId, clientId);
    if (!closer) {
      return res.status(404).json({ status: 'error', message: 'Closer not found' });
    }

    if (closer.status === 'active') {
      return res.status(400).json({ status: 'error', message: 'Closer is already active' });
    }

    await closerQueries.update(closerId, clientId, { status: 'active' });

    await auditLogger.log({
      clientId,
      entityType: 'closer',
      entityId: closerId,
      action: 'reactivated',
      fieldChanged: 'status',
      oldValue: closer.status,
      newValue: 'active',
      triggerSource: 'admin',
      triggerDetail: 'closer_reactivation',
    });

    logger.info('Closer reactivated', { closerId, clientId, name: closer.name });

    res.status(200).json({
      status: 'ok',
      action: 'reactivated',
      message: `Closer ${closer.name} reactivated.`,
    });
  } catch (error) {
    logger.error('Failed to reactivate closer', { clientId, closerId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to reactivate closer' });
  }
});

// POST /admin/clients/:clientId/closers/:closerId/register-fathom — Register Fathom webhook for existing closer
router.post('/clients/:clientId/closers/:closerId/register-fathom', async (req, res) => {
  const { clientId, closerId } = req.params;
  const { transcript_api_key } = req.body;

  if (!transcript_api_key) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required field: transcript_api_key',
    });
  }

  try {
    const closer = await closerQueries.findById(closerId, clientId);
    if (!closer) {
      return res.status(404).json({ status: 'error', message: 'Closer not found' });
    }

    // If closer already has a webhook, delete the old one first
    if (closer.fathom_webhook_id && closer.transcript_api_key) {
      try {
        await fathomAPI.deleteWebhook(closer.transcript_api_key, closer.fathom_webhook_id);
      } catch (err) {
        logger.warn('Failed to delete old Fathom webhook, continuing with new registration', {
          closerId,
          oldWebhookId: closer.fathom_webhook_id,
          error: err.message,
        });
      }
    }

    // Register new webhook
    const webhook = await fathomAPI.registerWebhook(transcript_api_key);

    // Update closer record with API key and webhook details
    await closerQueries.update(closerId, clientId, {
      transcript_api_key: transcript_api_key,
      fathom_webhook_id: webhook.id,
      fathom_webhook_secret: webhook.secret,
    });

    await auditLogger.log({
      clientId,
      entityType: 'closer',
      entityId: closerId,
      action: 'updated',
      fieldChanged: 'fathom_webhook_id',
      oldValue: closer.fathom_webhook_id || null,
      newValue: webhook.id,
      triggerSource: 'admin',
      triggerDetail: 'fathom_webhook_registration',
    });

    logger.info('Fathom webhook registered for existing closer', {
      closerId,
      clientId,
      webhookId: webhook.id,
    });

    res.status(200).json({
      status: 'ok',
      fathom_webhook_id: webhook.id,
      fathom_webhook_status: 'registered',
      message: `Fathom webhook registered for ${closer.name}. Recordings will now send transcripts automatically.`,
    });
  } catch (error) {
    logger.error('Failed to register Fathom webhook', {
      closerId,
      clientId,
      error: error.message,
    });
    res.status(500).json({
      status: 'error',
      message: `Fathom webhook registration failed: ${error.message}`,
    });
  }
});

module.exports = router;
