/**
 * ADMIN ROUTES — /api/admin/*
 *
 * Tyler-only admin endpoints for managing clients, tiers, and tokens.
 * All routes require X-Admin-Key header (adminAuth middleware).
 *
 * Routes:
 *   GET    /api/admin/clients                     — List all clients
 *   GET    /api/admin/clients/:clientId            — Get single client
 *   POST   /api/admin/clients/:clientId/tier       — Change client tier
 *   POST   /api/admin/tokens                       — Generate access token
 *   DELETE /api/admin/tokens/:tokenId              — Revoke a token
 *   GET    /api/admin/tokens                       — List all active tokens
 *   GET    /api/admin/overview                     — Cross-client summary
 */

const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const bq = require('../db/BigQueryClient');
const tokenManager = require('../utils/tokenManager');
const logger = require('../utils/logger');

const router = express.Router();

// All admin routes require admin authentication
router.use(adminAuth);

// ── List All Clients ────────────────────────────────────────────

router.get('/clients', async (req, res) => {
  try {
    if (!bq.isAvailable()) {
      // Demo mode: return sample client list
      return res.json({
        success: true,
        data: [
          {
            client_id: 'demo_basic_client',
            company_name: 'Demo Company (Basic)',
            plan_tier: 'basic',
            closer_count: 1,
            status: 'Active',
          },
          {
            client_id: 'demo_insight_client',
            company_name: 'Demo Company (Insight)',
            plan_tier: 'insight',
            closer_count: 3,
            status: 'Active',
          },
          {
            client_id: 'demo_exec_client',
            company_name: 'Demo Company (Executive)',
            plan_tier: 'executive',
            closer_count: 5,
            status: 'Active',
          },
        ],
      });
    }

    const rows = await bq.runAdminQuery(
      `SELECT c.client_id, c.company_name, c.plan_tier,
        (SELECT COUNT(*) FROM ${bq.table('Closers')} cl
         WHERE cl.client_id = c.client_id AND LOWER(cl.status) = 'active') as closer_count,
        c.status
       FROM ${bq.table('Clients')} c
       ORDER BY c.company_name`
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('List clients failed, falling back to demo data', { error: err.message });
    // Fallback to demo data when BQ fails (expired creds, missing tables, etc.)
    return res.json({
      success: true,
      data: [
        { client_id: 'demo_basic_client', company_name: 'Demo Company (Basic)', plan_tier: 'basic', closer_count: 1, status: 'Active' },
        { client_id: 'demo_insight_client', company_name: 'Demo Company (Insight)', plan_tier: 'insight', closer_count: 3, status: 'Active' },
        { client_id: 'demo_exec_client', company_name: 'Demo Company (Executive)', plan_tier: 'executive', closer_count: 5, status: 'Active' },
      ],
    });
  }
});

// ── Get Single Client ───────────────────────────────────────────

router.get('/clients/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    if (!bq.isAvailable()) {
      // Use getClientById for consistent demo data (includes closers)
      const clientRecord = await tokenManager.getClientById(clientId);
      if (!clientRecord) {
        return res.json({
          success: true,
          data: {
            client_id: clientId,
            company_name: 'Unknown Client',
            plan_tier: 'basic',
            closer_count: 0,
            closers: [],
            status: 'Active',
          },
        });
      }
      return res.json({
        success: true,
        data: {
          ...clientRecord,
          closer_count: (clientRecord.closers || []).length,
          status: 'Active',
        },
      });
    }

    // Fetch client record
    const rows = await bq.runAdminQuery(
      `SELECT *
       FROM ${bq.table('Clients')}
       WHERE client_id = @clientId`,
      { clientId }
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Also fetch closers so the admin view can set up filters
    const closerRows = await bq.runQuery(
      `SELECT closer_id, name
       FROM ${bq.table('Closers')}
       WHERE client_id = @clientId AND status = 'Active'
       ORDER BY name`,
      { clientId }
    );

    res.json({
      success: true,
      data: {
        ...rows[0],
        closers: closerRows.map((r) => ({ closer_id: r.closer_id, name: r.name })),
      },
    });
  } catch (err) {
    logger.error('Get client failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load client' });
  }
});

// ── Change Client Tier ──────────────────────────────────────────

router.post('/clients/:clientId/tier', async (req, res) => {
  const { clientId } = req.params;
  const { tier } = req.body;

  // Validate tier value
  const validTiers = ['basic', 'insight', 'executive'];
  if (!tier || !validTiers.includes(tier)) {
    return res.status(400).json({
      success: false,
      error: `Invalid tier. Must be one of: ${validTiers.join(', ')}`,
    });
  }

  try {
    if (!bq.isAvailable()) {
      logger.info('Tier change (demo mode)', { clientId, tier });
      return res.json({ success: true, data: { client_id: clientId, plan_tier: tier } });
    }

    await bq.runAdminQuery(
      `UPDATE ${bq.table('Clients')}
       SET plan_tier = @tier
       WHERE client_id = @clientId`,
      { clientId, tier }
    );

    logger.info('Client tier updated', { clientId, tier });
    res.json({ success: true, data: { client_id: clientId, plan_tier: tier } });
  } catch (err) {
    logger.error('Tier change failed', { error: err.message, clientId });
    res.status(500).json({ success: false, error: 'Failed to update tier' });
  }
});

// ── Generate Access Token ───────────────────────────────────────

router.post('/tokens', async (req, res) => {
  const { clientId, tokenType = 'client', label, partnerId, assignedClientIds, expiresAt } = req.body;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId is required' });
  }

  try {
    const tokenId = await tokenManager.generateToken(clientId, tokenType, label, {
      partnerId,
      assignedClientIds,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    res.json({
      success: true,
      data: {
        token_id: tokenId,
        client_id: clientId,
        token_type: tokenType,
        label,
        dashboard_url: `/d/${tokenId}`,
      },
    });
  } catch (err) {
    logger.error('Token generation failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to generate token' });
  }
});

// ── Revoke Token ────────────────────────────────────────────────

router.delete('/tokens/:tokenId', async (req, res) => {
  try {
    await tokenManager.revokeToken(req.params.tokenId);
    res.json({ success: true });
  } catch (err) {
    logger.error('Token revocation failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to revoke token' });
  }
});

// ── List Active Tokens ──────────────────────────────────────────

router.get('/tokens', async (req, res) => {
  try {
    const tokens = await tokenManager.listTokens();
    res.json({ success: true, data: tokens });
  } catch (err) {
    logger.error('List tokens failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load tokens' });
  }
});

// ── Cross-Client Overview ───────────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    if (!bq.isAvailable()) {
      return res.json({
        success: true,
        data: {
          totalClients: 3,
          activeClients: 3,
          totalClosers: 9,
          totalCalls: 142,
          tiers: { basic: 1, insight: 1, executive: 1 },
        },
      });
    }

    const [clientRows, closerRows, callRows] = await Promise.all([
      bq.runAdminQuery(
        `SELECT
          COUNT(DISTINCT client_id) as total_clients,
          COUNTIF(LOWER(status) = 'active') as active_clients,
          COUNTIF(plan_tier = 'basic') as basic_count,
          COUNTIF(plan_tier = 'insight') as insight_count,
          COUNTIF(plan_tier = 'executive') as executive_count
         FROM ${bq.table('Clients')}`
      ),
      bq.runAdminQuery(
        `SELECT COUNT(*) as total_closers
         FROM ${bq.table('Closers')}
         WHERE LOWER(status) = 'active'`
      ),
      bq.runAdminQuery(
        `SELECT COUNT(*) as total_calls
         FROM ${bq.table('Calls')}`
      ),
    ]);

    const summary = clientRows[0] || {};
    const closerSummary = closerRows[0] || {};
    const callSummary = callRows[0] || {};
    res.json({
      success: true,
      data: {
        totalClients: summary.total_clients || 0,
        activeClients: summary.active_clients || 0,
        totalClosers: closerSummary.total_closers || 0,
        totalCalls: callSummary.total_calls || 0,
        tiers: {
          basic: summary.basic_count || 0,
          insight: summary.insight_count || 0,
          executive: summary.executive_count || 0,
        },
      },
    });
  } catch (err) {
    logger.error('Admin overview failed, falling back to demo data', { error: err.message });
    // Fallback to demo data when BQ fails
    return res.json({
      success: true,
      data: {
        totalClients: 3,
        activeClients: 3,
        totalClosers: 9,
        totalCalls: 1247,
        tiers: { basic: 1, insight: 1, executive: 1 },
      },
    });
  }
});

module.exports = router;
