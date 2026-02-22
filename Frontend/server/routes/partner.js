/**
 * PARTNER ROUTES — /api/partner/*
 *
 * Partner endpoints — read-only access to assigned clients.
 * All routes require X-Partner-Token header (partnerAuth middleware).
 *
 * Routes:
 *   GET /api/partner/clients                              — List assigned clients
 *   GET /api/partner/clients/:clientId/dashboard/:section — View client's dashboard
 */

const express = require('express');
const partnerAuth = require('../middleware/partnerAuth');
const bq = require('../db/BigQueryClient');
const logger = require('../utils/logger');

const router = express.Router();

// All partner routes require partner authentication
router.use(partnerAuth);

// ── List Assigned Clients ───────────────────────────────────────

router.get('/clients', async (req, res) => {
  try {
    if (!bq.isAvailable() || req.assignedClientIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Build parameterized IN clause
    const placeholders = req.assignedClientIds.map((_, i) => `@id${i}`);
    const params = {};
    req.assignedClientIds.forEach((id, i) => { params[`id${i}`] = id; });

    const rows = await bq.runAdminQuery(
      `SELECT c.client_id, c.company_name, c.plan_tier,
        (SELECT COUNT(*) FROM ${bq.table('Closers')} cl
         WHERE cl.client_id = c.client_id AND LOWER(cl.status) = 'active') as closer_count,
        c.status
       FROM ${bq.table('Clients')} c
       WHERE c.client_id IN (${placeholders.join(', ')})
       ORDER BY c.company_name`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error('Partner list clients failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to load clients' });
  }
});

// ── View Client Dashboard Section ──────────────────────────────

router.get('/clients/:clientId/dashboard/:section', async (req, res) => {
  const { clientId, section } = req.params;

  // Verify the partner has access to this client
  if (!req.assignedClientIds.includes(clientId)) {
    return res.status(403).json({
      success: false,
      error: 'You do not have access to this client',
    });
  }

  // Placeholder — in Phase 3+, this will delegate to the same query
  // functions used by the dashboard routes
  res.json({
    success: true,
    data: { sections: {}, charts: {}, tables: {} },
    meta: {
      client_id: clientId,
      section,
      via: 'partner',
    },
  });
});

module.exports = router;
