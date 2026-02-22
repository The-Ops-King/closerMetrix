/**
 * TRANSCRIPT PROVIDERS
 *
 * Each provider has a unique webhook payload format.
 * The adapter pattern normalizes all of them into a standard internal format.
 *
 * Tiers:
 *   1 — Full integration (webhook + API polling for transcripts)
 *   2 — Webhook receiver only (adapter normalizes their payload)
 *   3 — Generic (client sends a standardized JSON payload via their own automation)
 *
 * TO ADD A NEW PROVIDER:
 * 1. Add an entry here
 * 2. Create src/services/transcript/adapters/{Name}Adapter.js
 * 3. The adapter must implement: normalize(rawPayload) → StandardTranscript
 * 4. Register it in TranscriptService.js adapter map
 * That's it. No other code changes needed.
 */
module.exports = [
  { key: 'fathom',   label: 'Fathom',     webhookPath: 'fathom',   tier: 1, hasWebhook: true,  hasAPI: true },
  { key: 'tldv',     label: 'tl;dv',      webhookPath: 'tldv',     tier: 1, hasWebhook: true,  hasAPI: true },
  { key: 'readai',   label: 'Read.ai',    webhookPath: 'readai',   tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'otter',    label: 'Otter.ai',   webhookPath: 'otter',    tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'grain',    label: 'Grain',       webhookPath: 'grain',    tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'gong',     label: 'Gong',        webhookPath: 'gong',     tier: 2, hasWebhook: true,  hasAPI: false },
  { key: 'generic',  label: 'Generic',     webhookPath: 'generic',  tier: 3, hasWebhook: true,  hasAPI: false },
];
