/**
 * CLOSERMETRIX EXPRESS SERVER
 *
 * Single Cloud Run service that:
 * 1. Serves the Express API at /api/*
 * 2. Serves the built React SPA for all other routes
 *
 * In development: API runs on :8080, Vite dev server on :5173 with proxy
 * In production: Express serves both API and static React build
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');

const app = express();

// ── Security & Middleware ──────────────────────────────────────
app.use(helmet({
  // Relax CSP for the React SPA (inline scripts from Vite, Google Fonts)
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(express.json());

// CORS — in dev allow Vite dev server, in prod same-origin
if (config.isDev) {
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
}

// Request logging — concise in dev, JSON in prod
app.use(morgan(config.isDev ? 'dev' : 'combined'));

// ── API Routes ────────────────────────────────────────────────

// Health check — used by Cloud Run for liveness probes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Route groups ──────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/backend', require('./routes/backendProxy'));
app.use('/api/partner', require('./routes/partner'));

// ── Static File Serving (Production) ──────────────────────────
// In production, serve the built React SPA from client/dist
const clientDistPath = path.join(__dirname, '../client/dist');

app.use(express.static(clientDistPath));

// Catch-all: serve React SPA for client-side routing
// This handles /d/:token, /admin/*, /partner/*, etc.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ── Start Server ──────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`CloserMetrix Dashboard running on port ${config.port}`, {
    env: config.nodeEnv,
    port: config.port,
  });
});

module.exports = app;
