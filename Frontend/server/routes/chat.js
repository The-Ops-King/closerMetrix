/**
 * CHAT ROUTES
 *
 * Proxies chatbot messages from the frontend to the Backend AI service.
 * Requires insight+ tier authentication.
 */

const express = require('express');
const clientIsolation = require('../middleware/clientIsolation');
const { requireTier } = require('../middleware/tierGate');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// All chat routes require authentication + insight tier minimum
router.use(clientIsolation);
router.use(requireTier('insight'));

// POST /api/dashboard/chat/message — proxy to Backend
router.post('/message', async (req, res) => {
  try {
    const { conversationId, message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Forward to Backend with client context
    const url = new URL('/admin/chat/message', config.backendApiUrl);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.adminApiKey}`,
      },
      body: JSON.stringify({
        clientId: req.clientId,
        conversationId,
        message: message.trim().slice(0, 2000),
        history,
        companyName: req.companyName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    logger.error('Chat proxy error', { error: err.message });
    res.status(500).json({ success: false, error: 'Chat service unavailable' });
  }
});

module.exports = router;
