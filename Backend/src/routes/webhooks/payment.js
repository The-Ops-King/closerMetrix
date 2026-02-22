/**
 * PAYMENT WEBHOOK ROUTE
 *
 * POST /webhooks/payment
 *
 * Called by the client's automation (Zapier, Make, custom) connected to
 * their payment processor (Stripe, PayPal, etc.).
 *
 * The payload format is standardized — clients configure their automation
 * to send this specific shape.
 *
 * Auth: clientIsolation identifies the client from body.client_id,
 * then webhookAuth.payment validates Authorization header against
 * the client's stored webhook_secret.
 *
 * Required fields: client_id, prospect_email, payment_amount
 * Optional: prospect_name, payment_date, payment_type, product_name, notes
 */

const express = require('express');
const router = express.Router();
const clientIsolation = require('../../middleware/clientIsolation');
const webhookAuth = require('../../middleware/webhookAuth');
const paymentService = require('../../services/PaymentService');
const logger = require('../../utils/logger');

// POST /webhooks/payment
router.post('/', clientIsolation, webhookAuth.payment, async (req, res) => {
  const { prospect_email, payment_amount } = req.body;

  // Validate required fields
  if (!prospect_email) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required field: prospect_email',
    });
  }

  if (payment_amount == null) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required field: payment_amount',
    });
  }

  const amount = Number(payment_amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid payment_amount: must be a positive number',
    });
  }

  logger.info('Payment webhook received', {
    clientId: req.clientId,
    prospectEmail: prospect_email,
    amount: payment_amount,
    type: req.body.payment_type || 'full',
  });

  try {
    const result = await paymentService.processPayment(req.body, req.clientId);

    if (result.status === 'error') {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    logger.error('Payment processing failed', {
      clientId: req.clientId,
      prospectEmail: prospect_email,
      error: error.message,
    });

    res.status(500).json({
      status: 'error',
      message: 'Payment processing failed',
    });
  }
});

module.exports = router;
