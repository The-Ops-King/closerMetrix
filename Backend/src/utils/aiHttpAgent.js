/**
 * SHARED HTTPS AGENT FOR ANTHROPIC CALLS
 *
 * The @anthropic-ai/sdk (v0.39) ships its own node-fetch-based HTTP client,
 * whose default agent keeps sockets alive and reuses them. When the server (or
 * an upstream proxy/NAT) closes an idle keep-alive socket, the SDK's next
 * request reuses that dead socket and the call fails with:
 *   "Invalid response body ... : Premature close"
 *
 * Disabling keep-alive forces a fresh connection per request, eliminating
 * stale-socket reuse. AI calls are low-volume, so the extra TLS handshake
 * (~tens of ms) is negligible next to a multi-hundred-ms model call.
 *
 * Passed to every `new Anthropic({ httpAgent })` so the fix is centralized.
 */

const https = require('https');

module.exports = new https.Agent({ keepAlive: false });
