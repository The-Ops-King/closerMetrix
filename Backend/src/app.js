/**
 * EXPRESS APP SETUP
 *
 * Configures Express with all middleware and routes.
 * Separated from index.js so tests can import the app without starting the server.
 *
 * Middleware order matters:
 * 1. Security headers (helmet)
 * 2. CORS
 * 3. Body parsing
 * 4. Request logging
 * 5. Routes
 * 6. 404 handler
 * 7. Global error handler (must be last)
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const registerRoutes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Security headers ──────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────
// Restrict to known origins. Webhooks don't use CORS (server-to-server).
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (webhooks, server-to-server, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────
// Parse JSON bodies up to 5MB (transcripts can be large)
// Preserve raw body buffer for HMAC signature verification on webhooks
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.startsWith('/webhooks/')) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later' },
  // Skip rate limiting for webhook endpoints (they have their own auth)
  skip: (req) => req.path.startsWith('/webhooks/'),
});
app.use(apiLimiter);

// ── Request logging ─────────────────────────────────────
app.use(requestLogger);

// ── Static files (logo, etc.) ─────────────────────────
const path = require('path');
app.use('/public', express.static(path.join(__dirname, 'public')));

// ── Root endpoint ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'CloserMetrix API',
    version: '1.0.0',
    status: 'running',
  });
});

// ── Register all routes ─────────────────────────────────
registerRoutes(app);

// ── 404 handler ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

// ── Global error handler (must be last) ─────────────────
app.use(errorHandler);

module.exports = app;
