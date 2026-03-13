/**
 * ROUTE AGGREGATOR
 *
 * Registers all route groups on the Express app.
 * Webhook routes handle incoming data from external systems.
 * Admin routes handle client/closer management and diagnostics.
 */

const calendarWebhook = require('./webhooks/calendar');
const transcriptWebhook = require('./webhooks/transcript');
const paymentWebhook = require('./webhooks/payment');
const adminClients = require('./admin/clients');
const adminClosers = require('./admin/closers');
const adminHealth = require('./admin/health');
const adminEmail = require('./admin/email');
const adminMarketPulse = require('./admin/market-pulse');
const adminInsights = require('./admin/insights');
const adminChat = require('./admin/chat');
const adminTldv = require('./admin/tldv');

function registerRoutes(app) {
  // Webhook endpoints — called by external systems
  app.use('/webhooks/calendar', calendarWebhook);
  app.use('/webhooks/transcript', transcriptWebhook);
  app.use('/webhooks/payment', paymentWebhook);

  // Email preview & test routes — registered before other admin routes
  // so the closers router's blanket auth doesn't intercept these
  app.use('/admin/email', adminEmail);

  // AI endpoints (called by dashboard service — keeps API keys on Backend only)
  app.use('/admin/market-pulse', adminMarketPulse);
  app.use('/admin/insights', adminInsights);

  // Chatbot AI endpoint
  app.use('/admin/chat', adminChat);

  // tl;dv integration management
  app.use('/admin/tldv', adminTldv);

  // Admin endpoints — health check first (no auth, Cloud Run needs it)
  app.use('/admin', adminHealth);
  app.use('/admin/clients', adminClients);
  app.use('/admin', adminClosers);
}

module.exports = registerRoutes;
