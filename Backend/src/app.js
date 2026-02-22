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
const registerRoutes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Security headers ──────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────
// Allow requests from any origin for now (webhook sources vary).
// Tighten this when the React dashboard is built.
app.use(cors());

// ── Body parsing ─────────────────────────────────────────
// Parse JSON bodies up to 5MB (transcripts can be large)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging ─────────────────────────────────────
app.use(requestLogger);

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
