/**
 * MARKET PULSE ROUTES — Backend AI Endpoints
 *
 * These endpoints run AI theme condensing using the Backend's API keys.
 * The Frontend dashboard proxies to these instead of calling AI directly,
 * so AI keys don't need to be on the client-facing dashboard service.
 *
 * All routes require admin auth (service-to-service from dashboard).
 *
 * Endpoints:
 *   POST /admin/market-pulse/condense          — Condense texts into themes
 *   POST /admin/market-pulse/script-comparison  — Compare themes vs script
 *   GET  /admin/market-pulse/status             — Check AI availability
 */

const express = require('express');
const router = express.Router();
const webhookAuth = require('../../middleware/webhookAuth');
const marketPulse = require('../../services/marketPulse');
const logger = require('../../utils/logger');

// All market pulse routes require admin auth (dashboard → backend service call)
router.use(webhookAuth.admin);

// ── Status check ─────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ success: true, available: marketPulse.isAvailable() });
});

// ── Condense texts into themes ───────────────────────────────────
router.post('/condense', async (req, res) => {
  try {
    if (!marketPulse.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Market Pulse AI is not configured',
      });
    }

    const { clientId, texts, type, force, aiProvider } = req.body;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId is required' });
    }

    if (!type || !['pains', 'goals'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be "pains" or "goals"' });
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.json({ success: true, data: { themes: [] } });
    }

    const capped = texts.slice(0, 500);
    const themes = await marketPulse.condenseTexts(clientId, type, capped, {
      force: !!force,
      aiProvider: aiProvider || 'claude',
    });

    res.json({ success: true, data: { themes } });
  } catch (err) {
    logger.error('Market Pulse condense error', { error: err.message, clientId: req.body?.clientId });
    res.status(500).json({ success: false, error: 'Failed to generate market pulse themes' });
  }
});

// ── Script comparison ────────────────────────────────────────────
router.post('/script-comparison', async (req, res) => {
  try {
    if (!marketPulse.isAvailable()) {
      return res.status(503).json({ success: false, error: 'Market Pulse AI is not configured' });
    }

    const { clientId, themes, type, scriptTemplate, aiProvider } = req.body;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId is required' });
    }

    if (!type || !['pains', 'goals'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be "pains" or "goals"' });
    }

    if (!Array.isArray(themes) || themes.length === 0) {
      return res.json({ success: true, data: { addressed: [], gaps: [], unused: [] } });
    }

    if (!scriptTemplate) {
      return res.json({ success: true, data: null, message: 'No script template provided' });
    }

    const result = await marketPulse.compareWithScript(
      clientId, type, themes, scriptTemplate, aiProvider || 'claude'
    );

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Script comparison error', { error: err.message, clientId: req.body?.clientId });
    res.status(500).json({ success: false, error: 'Failed to generate script comparison' });
  }
});

module.exports = router;
