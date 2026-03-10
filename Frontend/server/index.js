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
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');

const app = express();

// ── Security & Middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "http://localhost:*", config.isDev ? "ws://localhost:*" : null].filter(Boolean),
    },
  },
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(compression());
app.use(express.json());

// CORS — in dev allow Vite dev server, in prod same-origin
if (config.isDev) {
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
}

// Request logging — concise in dev, JSON in prod
app.use(morgan(config.isDev ? 'dev' : 'combined'));

// ── Rate Limiting ─────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // stricter for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth attempts, please try again later' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/backend', adminLimiter);

// ── API Routes ────────────────────────────────────────────────

// Health check — used by Cloud Run for liveness probes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Route groups ──────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/backend', require('./middleware/adminAuth'), require('./routes/backendProxy'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/partner', require('./routes/partner'));
// Activity tracking — token must be in X-Client-Token header (same as other dashboard endpoints)
app.use('/api/activity', require('./middleware/clientIsolation'), require('./routes/activity'));

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
