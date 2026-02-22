/**
 * CLIENT ADMIN ROUTES
 *
 * CRUD operations for client management and onboarding.
 * All routes require admin authentication (ADMIN_API_KEY).
 *
 * Endpoints:
 *   GET    /admin/clients              — List all clients
 *   GET    /admin/clients/:clientId    — Get client details
 *   POST   /admin/clients              — Create new client
 *   PUT    /admin/clients/:clientId    — Update client
 *   DELETE /admin/clients/:clientId    — Soft-delete client (set Inactive)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const webhookAuth = require('../../middleware/webhookAuth');
const clientQueries = require('../../db/queries/clients');
const auditLogger = require('../../utils/AuditLogger');
const { generateId } = require('../../utils/idGenerator');
const logger = require('../../utils/logger');
const config = require('../../config');

// All client admin routes require admin auth
router.use(webhookAuth.admin);

const REQUIRED_CREATE_FIELDS = [
  'company_name',
  'primary_contact_email',
  'offer_name',
  'offer_price',
  'filter_word',
  'plan_tier',
  'timezone',
];

const VALID_PLAN_TIERS = ['basic', 'insight', 'executive'];

// GET /admin/clients — List all clients
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const clients = await clientQueries.list(status || null);
    res.status(200).json({ clients });
  } catch (error) {
    logger.error('Failed to list clients', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to list clients' });
  }
});

// GET /admin/clients/:clientId — Get client details
router.get('/:clientId', async (req, res) => {
  try {
    const client = await clientQueries.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }
    res.status(200).json(client);
  } catch (error) {
    logger.error('Failed to get client', { clientId: req.params.clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to get client' });
  }
});

// POST /admin/clients — Create new client
router.post('/', async (req, res) => {
  // Validate required fields
  const missing = REQUIRED_CREATE_FIELDS.filter(f => !req.body[f]);
  if (missing.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: `Missing required fields: ${missing.join(', ')}`,
    });
  }

  // Validate plan_tier
  if (!VALID_PLAN_TIERS.includes(req.body.plan_tier)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid plan_tier. Must be one of: ${VALID_PLAN_TIERS.join(', ')}`,
    });
  }

  // Validate offer_price is a positive number
  const offerPrice = Number(req.body.offer_price);
  if (isNaN(offerPrice) || offerPrice <= 0) {
    return res.status(400).json({
      status: 'error',
      message: 'offer_price must be a positive number',
    });
  }

  try {
    const clientId = generateId();
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const clientData = {
      client_id: clientId,
      company_name: req.body.company_name,
      name: req.body.name || null,
      primary_contact_email: req.body.primary_contact_email,
      primary_contact_phone: req.body.primary_contact_phone || null,
      timezone: req.body.timezone,
      offer_name: req.body.offer_name,
      offer_price: offerPrice,
      offer_description: req.body.offer_description || null,
      filter_word: req.body.filter_word,
      plan_tier: req.body.plan_tier,
      status: 'active',
      closer_count: 0,
      webhook_secret: webhookSecret,
      calendar_source: req.body.calendar_source || 'google_calendar',
      transcript_provider: req.body.transcript_provider || 'fathom',
      script_template: req.body.script_template || null,
      ai_prompt_overall: req.body.ai_prompt_overall || null,
      ai_prompt_discovery: req.body.ai_prompt_discovery || null,
      ai_prompt_pitch: req.body.ai_prompt_pitch || null,
      ai_prompt_close: req.body.ai_prompt_close || null,
      ai_prompt_objections: req.body.ai_prompt_objections || null,
      common_objections: req.body.common_objections || null,
      disqualification_criteria: req.body.disqualification_criteria || null,
      created_at: now,
      last_modified: now,
    };

    await clientQueries.create(clientData);

    await auditLogger.log({
      clientId,
      entityType: 'client',
      entityId: clientId,
      action: 'created',
      newValue: req.body.company_name,
      triggerSource: 'admin',
      triggerDetail: 'client_onboarding',
    });

    logger.info('Client created', {
      clientId,
      companyName: req.body.company_name,
      planTier: req.body.plan_tier,
    });

    const baseUrl = config.server.baseUrl;
    const provider = clientData.transcript_provider;

    res.status(201).json({
      status: 'ok',
      client_id: clientId,
      webhook_secret: webhookSecret,
      transcript_webhook_url: `${baseUrl}/webhooks/transcript/${provider}`,
      payment_webhook_url: `${baseUrl}/webhooks/payment`,
      next_steps: [
        `Add closers via POST /admin/clients/${clientId}/closers`,
        'Have closers share their Google Calendar with tyler@closermetrix.com',
        `Configure ${provider} webhook to send to the transcript_webhook_url`,
        'Configure payment processor to send to the payment_webhook_url with Authorization header',
      ],
    });
  } catch (error) {
    logger.error('Failed to create client', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to create client' });
  }
});

// PUT /admin/clients/:clientId — Update client
router.put('/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    const existing = await clientQueries.findById(clientId);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    // Prevent updating immutable fields
    const immutableFields = ['client_id', 'created_at', 'webhook_secret'];
    const updates = { ...req.body };
    for (const field of immutableFields) {
      delete updates[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No updatable fields provided' });
    }

    // Validate plan_tier if being updated
    if (updates.plan_tier && !VALID_PLAN_TIERS.includes(updates.plan_tier)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid plan_tier. Must be one of: ${VALID_PLAN_TIERS.join(', ')}`,
      });
    }

    // Validate offer_price if being updated
    if (updates.offer_price != null) {
      const price = Number(updates.offer_price);
      if (isNaN(price) || price <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'offer_price must be a positive number',
        });
      }
      updates.offer_price = price;
    }

    await clientQueries.update(clientId, updates);

    await auditLogger.log({
      clientId,
      entityType: 'client',
      entityId: clientId,
      action: 'updated',
      triggerSource: 'admin',
      triggerDetail: 'client_update',
      metadata: { fields_updated: Object.keys(updates) },
    });

    // Fetch updated record
    const updated = await clientQueries.findById(clientId);
    res.status(200).json(updated);
  } catch (error) {
    logger.error('Failed to update client', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update client' });
  }
});

// PATCH /admin/clients/:clientId/filter-words — Add filter words to existing list
router.patch('/:clientId/filter-words', async (req, res) => {
  const { clientId } = req.params;
  const { words } = req.body;

  if (!words || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Provide { "words": ["strategy", "discovery"] } as an array of words to add',
    });
  }

  try {
    const existing = await clientQueries.findById(clientId);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    // Snapshot old value before mutation (mock shares object references)
    const oldFilterWord = existing.filter_word || '';

    // Parse existing filter words into a Set for dedup
    const current = oldFilterWord
      ? oldFilterWord.split(',').map(w => w.trim()).filter(Boolean)
      : [];
    const currentSet = new Set(current.map(w => w.toLowerCase()));

    // Add only new words (case-insensitive dedup, preserve original casing)
    const added = [];
    for (const word of words) {
      const trimmed = word.trim();
      if (trimmed && !currentSet.has(trimmed.toLowerCase())) {
        current.push(trimmed);
        currentSet.add(trimmed.toLowerCase());
        added.push(trimmed);
      }
    }

    if (added.length === 0) {
      return res.status(200).json({
        status: 'ok',
        message: 'All words already exist',
        filter_word: existing.filter_word,
      });
    }

    const newFilterWord = current.join(',');
    await clientQueries.update(clientId, { filter_word: newFilterWord });

    await auditLogger.log({
      clientId,
      entityType: 'client',
      entityId: clientId,
      action: 'updated',
      fieldChanged: 'filter_word',
      oldValue: oldFilterWord,
      newValue: newFilterWord,
      triggerSource: 'admin',
      triggerDetail: 'filter_word_add',
    });

    res.status(200).json({
      status: 'ok',
      added,
      filter_word: newFilterWord,
    });
  } catch (error) {
    logger.error('Failed to add filter words', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to add filter words' });
  }
});

// DELETE /admin/clients/:clientId — Soft-delete client (set status to Inactive)
router.delete('/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    const existing = await clientQueries.findById(clientId);
    if (!existing) {
      return res.status(404).json({ status: 'error', message: 'Client not found' });
    }

    if (existing.status === 'Inactive' || existing.status === 'inactive') {
      return res.status(400).json({ status: 'error', message: 'Client is already inactive' });
    }

    await clientQueries.update(clientId, { status: 'Inactive' });

    await auditLogger.log({
      clientId,
      entityType: 'client',
      entityId: clientId,
      action: 'deactivated',
      fieldChanged: 'status',
      oldValue: existing.status,
      newValue: 'Inactive',
      triggerSource: 'admin',
      triggerDetail: 'client_soft_delete',
    });

    logger.info('Client soft-deleted', { clientId, companyName: existing.company_name });

    res.status(200).json({
      status: 'ok',
      action: 'deactivated',
      message: `Client "${existing.company_name}" deactivated. All historical data preserved.`,
    });
  } catch (error) {
    logger.error('Failed to soft-delete client', { clientId, error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to deactivate client' });
  }
});

module.exports = router;
