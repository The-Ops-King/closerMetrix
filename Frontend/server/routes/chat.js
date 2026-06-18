/**
 * CHAT ROUTES
 *
 * Proxies chatbot messages from the frontend to the Backend AI service.
 * Requires insight+ tier authentication.
 */

const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const clientIsolation = require('../middleware/clientIsolation');
const { requireTier } = require('../middleware/tierGate');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// Google Auth client for Cloud Run service-to-service ID tokens (production only)
const _backendAuth = new GoogleAuth();
let _backendIdClient = null;

/**
 * Returns the Cloud Run ID token Authorization header for the Backend service,
 * or null in local dev (localhost backend needs no token).
 */
async function getBackendIdToken() {
  if (config.backendApiUrl.includes('localhost')) return null;
  try {
    if (!_backendIdClient) {
      _backendIdClient = await _backendAuth.getIdTokenClient(config.backendApiUrl);
    }
    const headers = await _backendIdClient.getRequestHeaders();
    return headers.Authorization; // "Bearer <id-token>"
  } catch (err) {
    logger.error('Chat proxy: failed to get Cloud Run ID token', { error: err.message });
    return null;
  }
}

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

    // Forward to Backend with client context.
    // App auth → X-Admin-Key; Cloud Run service-to-service auth → Authorization: Bearer <ID token>.
    const url = new URL('/admin/chat/message', config.backendApiUrl);
    const headers = {
      'Content-Type': 'application/json',
      'X-Admin-Key': config.adminApiKey,
    };
    const idToken = await getBackendIdToken();
    if (idToken) headers['Authorization'] = idToken;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
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
