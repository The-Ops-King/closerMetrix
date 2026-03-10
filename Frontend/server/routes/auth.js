/**
 * AUTH ROUTES — /api/auth/*
 *
 * Token validation endpoints. Used by the React app on initial load
 * to resolve a token into client context (client_id, tier, closers).
 *
 * Routes:
 *   GET /api/auth/validate?token=xxx  — Validate client access token
 */

const express = require('express');
const tokenManager = require('../utils/tokenManager');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/auth/validate?token=xxx
 *
 * Called by AuthContext on initial load at /d/:token.
 * Returns client_id, company_name, plan_tier, and closers list.
 *
 * Response: { client_id, company_name, plan_tier, closers: [{closer_id, name}] }
 */
router.get('/validate', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Missing token query parameter',
    });
  }

  try {
    const clientRecord = await tokenManager.validateToken(token);

    if (!clientRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired access link',
      });
    }

    logger.debug('Token validated', {
      clientId: clientRecord.client_id,
      tier: clientRecord.plan_tier,
    });

    // Return the shape expected by AuthContext
    const response = {
      client_id: clientRecord.client_id,
      company_name: clientRecord.company_name,
      plan_tier: clientRecord.plan_tier,
      closers: clientRecord.closers,
      kpi_targets: clientRecord.kpi_targets || null,
      ai_provider: clientRecord.ai_provider || 'claude',
      call_sources: clientRecord.call_sources || [],
    };

    // Include closer scope if this is a closer-scoped token
    if (clientRecord.closer_id) {
      response.closer_id = clientRecord.closer_id;
      response.token_type = 'closer';
    }

    return res.json(response);
  } catch (err) {
    logger.error('Token validation endpoint error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: 'Token validation failed',
    });
  }
});

module.exports = router;
