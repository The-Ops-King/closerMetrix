#!/usr/bin/env node
/**
 * TEST PAYMENT WEBHOOK
 *
 * Fires a test payment payload at the deployed payment webhook so you can
 * verify auth + the full processing pipeline end-to-end before handing the
 * webhook over to a client's Zapier.
 *
 * Usage:
 *   CLIENT_ID=... \
 *   WEBHOOK_SECRET=... \
 *   PROSPECT_EMAIL=test+payment@example.com \
 *   AMOUNT=1 \
 *   node scripts/test-payment-webhook.js
 *
 * Optional:
 *   BASE_URL=https://api.closermetrix.com   (default)
 *   PAYMENT_TYPE=full|deposit|payment_plan|refund|chargeback   (default: full)
 *   PROSPECT_NAME="Test Person"
 *   PRODUCT_NAME="Test Offer"
 *   NOTES="Webhook smoke test"
 *
 * Prints HTTP status + parsed response body. Non-200 = exit 1.
 */

const BASE_URL = process.env.BASE_URL || 'https://api.closermetrix.com';
const CLIENT_ID = process.env.CLIENT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PROSPECT_EMAIL = process.env.PROSPECT_EMAIL;
const AMOUNT = process.env.AMOUNT;

if (!CLIENT_ID || !WEBHOOK_SECRET || !PROSPECT_EMAIL || !AMOUNT) {
  console.error('Missing required env: CLIENT_ID, WEBHOOK_SECRET, PROSPECT_EMAIL, AMOUNT');
  process.exit(2);
}

const payload = {
  client_id: CLIENT_ID,
  prospect_email: PROSPECT_EMAIL,
  payment_amount: Number(AMOUNT),
  payment_type: process.env.PAYMENT_TYPE || 'full',
  payment_date: new Date().toISOString().slice(0, 10),
};
if (process.env.PROSPECT_NAME) payload.prospect_name = process.env.PROSPECT_NAME;
if (process.env.PRODUCT_NAME) payload.product_name = process.env.PRODUCT_NAME;
if (process.env.NOTES) payload.notes = process.env.NOTES;

(async () => {
  const url = `${BASE_URL}/webhooks/payment`;
  console.log(`POST ${url}`);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  console.log(`\nHTTP ${res.status}`);
  console.log('Response:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));

  process.exit(res.ok ? 0 : 1);
})().catch((err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});
