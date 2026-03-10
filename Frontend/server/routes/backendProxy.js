/**
 * BACKEND PROXY ROUTES
 *
 * Proxies requests from the Frontend admin panel to the Backend API.
 * This keeps the Backend URL server-side and avoids CORS issues.
 *
 * Auth translation:
 *   Frontend sends X-Admin-Key → proxy converts to Authorization: Bearer
 *
 * All routes are mounted at /api/backend/* in server/index.js.
 */

const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

// Google Auth client for fetching ID tokens when calling authenticated Cloud Run services
const auth = new GoogleAuth();
let cachedClient = null;

/**
 * Returns a Google ID token for the Backend Cloud Run service.
 * In local dev (localhost URLs), returns null — no token needed.
 */
async function getIdToken() {
  if (config.backendApiUrl.includes('localhost')) return null;
  try {
    if (!cachedClient) {
      cachedClient = await auth.getIdTokenClient(config.backendApiUrl);
    }
    const headers = await cachedClient.getRequestHeaders();
    return headers.Authorization; // "Bearer <id-token>"
  } catch (err) {
    logger.error('Failed to get Cloud Run ID token', { error: err.message });
    return null;
  }
}

/**
 * Generic proxy helper — forwards a request to the Backend API.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {string} backendPath - Backend API path (e.g. '/admin/clients')
 * @param {string} [method] - HTTP method override (defaults to req.method)
 */
async function proxyToBackend(req, res, backendPath, method) {
  const httpMethod = method || req.method;
  const url = new URL(backendPath, config.backendApiUrl);

  // Forward query params for GET requests
  if (httpMethod === 'GET' && req.query) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (value != null) url.searchParams.set(key, value);
    });
  }

  // Build headers — translate X-Admin-Key → X-Admin-Key (keep separate from Cloud Run auth)
  const headers = { 'Content-Type': 'application/json' };
  const adminKey = req.headers['x-admin-key'];
  if (adminKey) {
    headers['X-Admin-Key'] = adminKey;
  }

  // Add Cloud Run ID token for service-to-service auth (production only)
  const idToken = await getIdToken();
  if (idToken) {
    headers['Authorization'] = idToken;
  }

  // Build fetch options
  const fetchOpts = { method: httpMethod, headers };

  // Forward body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(httpMethod) && req.body) {
    fetchOpts.body = JSON.stringify(req.body);
  }

  try {
    const backendRes = await fetch(url.toString(), fetchOpts);
    const data = await backendRes.json().catch(() => ({}));
    res.status(backendRes.status).json(data);
  } catch (err) {
    logger.error('Backend proxy error', { path: backendPath, error: err.message });
    res.status(502).json({ error: 'Backend unreachable' });
  }
}

// ── Client Routes ──────────────────────────────────────────────

// POST /api/backend/clients → POST /admin/clients
router.post('/clients', (req, res) => {
  proxyToBackend(req, res, '/admin/clients');
});

// PUT /api/backend/clients/:clientId → PUT /admin/clients/:clientId
router.put('/clients/:clientId', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}`);
});

// GET /api/backend/clients/:clientId → GET /admin/clients/:clientId
router.get('/clients/:clientId', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}`);
});

// DELETE /api/backend/clients/:clientId → DELETE /admin/clients/:clientId (soft-delete)
router.delete('/clients/:clientId', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}`);
});

// PATCH /api/backend/clients/:clientId/filter-words → PATCH /admin/clients/:clientId/filter-words
router.patch('/clients/:clientId/filter-words', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/filter-words`);
});

// ── Closer Routes ──────────────────────────────────────────────

// GET /api/backend/clients/:clientId/closers → GET /admin/clients/:clientId/closers
router.get('/clients/:clientId/closers', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/closers`);
});

// POST /api/backend/clients/:clientId/closers → POST /admin/clients/:clientId/closers
router.post('/clients/:clientId/closers', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/closers`);
});

// PUT /api/backend/clients/:clientId/closers/:closerId → PUT /admin/clients/:clientId/closers/:closerId
router.put('/clients/:clientId/closers/:closerId', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/closers/${req.params.closerId}`);
});

// DELETE /api/backend/clients/:clientId/closers/:closerId → DELETE /admin/clients/:clientId/closers/:closerId
router.delete('/clients/:clientId/closers/:closerId', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/closers/${req.params.closerId}`);
});

// PATCH /api/backend/clients/:clientId/closers/:closerId/reactivate → PATCH reactivate
router.patch('/clients/:clientId/closers/:closerId/reactivate', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/closers/${req.params.closerId}/reactivate`);
});

// POST /api/backend/clients/:clientId/closers/:closerId/register-fathom
router.post('/clients/:clientId/closers/:closerId/register-fathom', (req, res) => {
  proxyToBackend(req, res, `/admin/clients/${req.params.clientId}/closers/${req.params.closerId}/register-fathom`);
});

// ── System Routes ──────────────────────────────────────────────

// GET /api/backend/health → GET /admin/health
router.get('/health', (req, res) => {
  proxyToBackend(req, res, '/admin/health');
});

module.exports = router;
