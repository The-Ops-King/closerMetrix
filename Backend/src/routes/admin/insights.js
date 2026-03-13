/**
 * INSIGHT ENGINE ROUTES — Backend AI Endpoints
 *
 * Single endpoint that proxies insightEngine.generateInsight() calls
 * from the dashboard service. Keeps AI API keys on the Backend only.
 */

const express = require('express');
const router = express.Router();
const webhookAuth = require('../../middleware/webhookAuth');
const insightEngine = require('../../services/insightEngine');
const logger = require('../../utils/logger');

router.use(webhookAuth.admin);

// GET /admin/insights/status
router.get('/status', (req, res) => {
  res.json({ success: true, available: insightEngine.isAvailable() });
});

// POST /admin/insights/generate
router.post('/generate', async (req, res) => {
  try {
    if (!insightEngine.isAvailable()) {
      return res.status(503).json({ success: false, error: 'AI Insights not configured' });
    }

    const { clientId, section, metrics, options } = req.body;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId is required' });
    }
    if (!section) {
      return res.status(400).json({ success: false, error: 'section is required' });
    }

    const result = await insightEngine.generateInsight(clientId, section, metrics || {}, options || {});

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Insight generate error', { error: err.message, clientId: req.body?.clientId, section: req.body?.section });
    res.status(500).json({ success: false, error: 'Failed to generate insight' });
  }
});

module.exports = router;
