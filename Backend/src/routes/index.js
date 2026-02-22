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

function registerRoutes(app) {
  // Webhook endpoints — called by external systems
  app.use('/webhooks/calendar', calendarWebhook);
  app.use('/webhooks/transcript', transcriptWebhook);
  app.use('/webhooks/payment', paymentWebhook);

  // Admin endpoints — health check first (no auth, Cloud Run needs it)
  app.use('/admin', adminHealth);
  app.use('/admin/clients', adminClients);
  app.use('/admin', adminClosers);
}

module.exports = registerRoutes;
