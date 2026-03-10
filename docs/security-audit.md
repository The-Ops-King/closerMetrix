# CloserMetrix Security Audit Report

**Date:** 2026-03-09 | **Scope:** Full application (routes, middleware, queries, config, secrets)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 8 |
| High | 14 |
| Medium | 21 |
| Low | 13 |
| **Total** | **56** |

---

## CRITICAL FINDINGS (8)

### CR-1: No Server-Side Tier Enforcement on Dashboard Routes
- **File:** `Frontend/server/routes/dashboard.js` lines 6-26, 262-286
- **OWASP:** A01 Broken Access Control
- **Issue:** `requireTier()` middleware exists but is never applied to any dashboard route. A basic-tier client can call `/api/dashboard/violations` and get executive-only data.
- **Fix:** Apply `requireTier('executive')` to violations/adherence routes, `requireTier('insight')` to financial/attendance/etc.

### CR-2: Backend Proxy Has No Authentication Middleware
- **File:** `Frontend/server/index.js` line 50
- **OWASP:** A01 Broken Access Control
- **Issue:** `/api/backend/*` is mounted with zero auth middleware. The proxy forwards `X-Admin-Key` to Backend as `Authorization: Bearer`, but the Frontend Express layer performs no validation.
- **Fix:** Add `require('./middleware/adminAuth')` before `require('./routes/backendProxy')`.

### CR-3: Calendar Webhook Unauthenticated
- **File:** `Backend/src/routes/webhooks/calendar.js` line 22
- **OWASP:** A01 Broken Access Control
- **Issue:** `POST /webhooks/calendar/:clientId` has no auth middleware. `webhookAuth.calendar` exists but is never applied.
- **Fix:** Add `webhookAuth.calendar` middleware to the route.

### CR-4: Backend Admin Key Defaults to Empty String
- **File:** `Backend/src/config/index.js` line 30
- **OWASP:** A05 Security Misconfiguration
- **Issue:** Backend defaults `admin.apiKey` to `''`. Combined with the proxy having no auth (CR-2), this creates a wide-open admin attack surface.
- **Fix:** Throw on startup if `ADMIN_API_KEY` is not set in production.

### CR-5: Live API Keys in `.env`
- **File:** `.env` lines 21-29
- **OWASP:** A02 Cryptographic Failures
- **Issue:** Anthropic, OpenAI, Gemini, and Gmail SMTP keys stored in plaintext. If `.env` is ever accidentally committed, all keys are permanently in git history.
- **Fix:** Rotate all keys. Use GCP Secret Manager references instead of raw values.

### CR-6: Production Access Tokens in Git-Tracked CLAUDE.md
- **File:** `CLAUDE.md` lines 56-57
- **OWASP:** A02 Cryptographic Failures
- **Issue:** Two real access tokens and client IDs are documented in a committed file.
- **Fix:** Remove tokens from tracked files. Use env vars or an untracked secrets file. Rotate tokens.

### CR-7: Backend BigQueryClient Has No client_id Enforcement
- **File:** `Backend/src/db/BigQueryClient.js` line 48
- **OWASP:** A01 Broken Access Control
- **Issue:** Unlike Frontend's `runQuery()` which throws if `clientId` is missing, Backend accepts any query without validation.
- **Fix:** Mirror Frontend's throw guard. Add separate `queryAdmin()` for intentional cross-tenant ops.

### CR-8: Backend Queries Scan ALL Clients Without client_id
- **File:** `Backend/src/db/queries/calls.js` lines 175, 194, 227
- **OWASP:** A01 Broken Access Control
- **Issue:** `findAllStuckScheduled()`, `findPendingPastEndTime()`, `findWaitingPastTimeout()` return `SELECT *` across all clients.
- **Fix:** Return minimal columns. Consider iterating per-client.

---

## HIGH FINDINGS (14)

### H-1: Transcript Webhook Unauthenticated
- **File:** `Backend/src/routes/webhooks/transcript.js` line 28
- **Issue:** No signature verification despite `fathom_webhook_secret` being stored.
- **Fix:** Add HMAC signature verification per provider.

### H-2: Non-Constant-Time Secret Comparison (Backend)
- **File:** `Backend/src/middleware/webhookAuth.js` lines 69, 98
- **Issue:** Uses `!==` for secret comparison. Frontend uses `crypto.timingSafeEqual`, Backend does not.
- **Fix:** Use `crypto.timingSafeEqual` in both comparisons.

### H-3: Hardcoded Dev Admin Key
- **File:** `Frontend/server/config/index.js` line 26
- **Issue:** Defaults to `'dev-admin-key'` when `ADMIN_API_KEY` is unset.
- **Fix:** Throw error in production if `ADMIN_API_KEY` is not set.

### H-4: Backend CORS Allows All Origins
- **File:** `Backend/src/app.js` line 32
- **Issue:** `app.use(cors())` with zero restrictions.
- **Fix:** Restrict to known dashboard origins.

### H-5: CSP Disabled on Frontend
- **File:** `Frontend/server/index.js` line 26
- **Issue:** `contentSecurityPolicy: false` disables XSS protections.
- **Fix:** Configure a real CSP policy.

### H-6: Stack Traces Leaked in Non-Production
- **File:** `Backend/src/middleware/errorHandler.js` line 50
- **Fix:** Default to not sending stacks.

### H-7: No HTTP Rate Limiting
- **Files:** Both servers
- **Fix:** Add `express-rate-limit` middleware.

### H-8: closers.findByWorkEmailAnyClient() Leaks API Keys
- **File:** `Backend/src/db/queries/closers.js` line 42
- **Fix:** Return only `closer_id`, `client_id`, `name`, `work_email`.

### H-9: closers.findFathomClosersWithApiKey() No Client Isolation
- **File:** `Backend/src/db/queries/closers.js` line 119
- **Fix:** Explicit column list excluding `transcript_api_key`.

### H-10: clients.list() Unfiltered Returns All Clients
- **File:** `Backend/src/db/queries/clients.js` lines 35-49
- **Fix:** Require filters. Add admin auth middleware.

### H-11: Payment Webhook Secret Timing Attack
- **File:** `Backend/src/middleware/webhookAuth.js` line 69
- **Fix:** Use `crypto.timingSafeEqual`.

### H-12: Backend Proxy SSRF Risk
- **File:** `Frontend/server/routes/backendProxy.js` line 29
- **Fix:** Validate UUID format before constructing URL.

### H-13: Activity Endpoint Leaks Token in URL
- **File:** `Frontend/server/index.js` lines 54-59
- **Fix:** Use Authorization header instead of query param.

### H-14: Cloud Run Backend `--allow-unauthenticated`
- **Files:** Both `cloudbuild.yaml` files
- **Fix:** Use IAM service-to-service auth. Only Frontend needs public access.

---

## MEDIUM FINDINGS (21)

| # | Issue | File |
|---|-------|------|
| M-1 | Mass assignment denylist on client update | `Backend/src/routes/admin/clients.js` lines 169-228 |
| M-2 | Mass assignment denylist on closer update | `Backend/src/routes/admin/closers.js` lines 286-349 |
| M-3 | Email preview open in dev with real BQ data | `Backend/src/routes/admin/email.js` lines 50-51 |
| M-4 | Stack traces in email error responses | `Backend/src/routes/admin/email.js` lines 107, 132, 158 |
| M-5 | closerId not validated as UUID | `Frontend/server/routes/dashboard.js` lines 953-967 |
| M-6 | Internal error details in proxy 502 | `backendProxy.js` line 59, `dashboard.js` line 941 |
| M-7 | X-View-Client-Id no UUID validation | `Frontend/server/middleware/clientIsolation.js` line 50 |
| M-8 | Backend clientIsolation multi-source fallback | `Backend/src/middleware/clientIsolation.js` lines 28-30 |
| M-9 | Inactive clients retain token access | `Frontend/server/utils/tokenManager.js` lines 96-110 |
| M-10 | safeCompare leaks secret length | `clientIsolation.js` line 37, `adminAuth.js` line 57 |
| M-11 | activityLog uses runAdminQuery bypassing clientId | `Frontend/server/db/queries/activityLog.js` line 59 |
| M-12 | insightLog uses runAdminQuery | `Frontend/server/db/queries/insightLog.js` line 115 |
| M-13 | SELECT * returns excessive data in Backend | `Backend/src/db/queries/calls.js`, `closers.js`, `prospects.js` |
| M-14 | audit.findByEntity has no client_id | `Backend/src/db/queries/audit.js` line 31 |
| M-15 | Settings returns transcript_api_key to frontend | `Frontend/server/db/queries/settings.js` line 60 |
| M-16 | GCP service account key file on disk | `.env` line 18 |
| M-17 | SMTP credentials not in Secret Manager | `cloudbuild.yaml` |
| M-18 | Misspelled env var GEMENI_API_KEY | `.env` lines 25-26 |
| M-19 | No pagination on raw data endpoint | `Frontend/server/db/queries/rawData.js` |
| M-20 | /api/dashboard/raw-data no tier gate | `Frontend/server/routes/dashboard.js` |
| M-21 | Calendar webhook token equals clientId (not secret) | `Backend/src/middleware/webhookAuth.js` line 29 |

---

## LOW FINDINGS (13)

| # | Issue | File |
|---|-------|------|
| L-1 | No rate limiting on auth endpoints | `auth.js`, `adminAuth.js` |
| L-2 | Client IDs logged at INFO level | `auth.js` line 45 |
| L-3 | Hardcoded table name in callExport | `callExport.js` line 128 |
| L-4 | Column names from Object.keys() in SQL | Backend `insert()`/`update()` |
| L-5 | No LIMIT on rawData queries | `rawData.js` |
| L-6 | transcript_api_key in BQ Closers table | Accessible to any BQ reader |
| L-7 | Test files hardcode CLIENT_ID = 'friends_inc' | Tests against prod BQ |
| L-8 | No dependency vulnerability scanning in CI/CD | No npm audit, Dependabot |
| L-9 | Stack trace leak in non-prod errorHandler | `errorHandler.js` line 50 |
| L-10 | Error details in 502 proxy responses | `backendProxy.js` line 59 |
| L-11 | Token via query param leaks to logs | `index.js` lines 54-59 |
| L-12 | Missing security headers beyond helmet | No CSP, Permissions-Policy |
| L-13 | No npm audit in CI pipeline | `cloudbuild.yaml` |

---

## POSITIVE FINDINGS

- All BigQuery queries use parameterized `@param` syntax — no SQL injection
- Frontend `clientIsolation.js` uses `crypto.timingSafeEqual`
- Frontend client isolation middleware enforces tenant separation
- Soft deletes only — no destructive data removal
- Input validation on payment amounts, tier values, and goals
- Audit logging for admin actions
- `.gitignore` correctly excludes `.env`, `*.pem`, `*.key`
- Multi-stage Docker builds minimize attack surface
- AI rate limiting exists (10 calls/hr/client)
- Helmet enabled on both servers
- Production secrets loaded via GCP Secret Manager in `cloudbuild.yaml`

---

## PRIORITY REMEDIATION ORDER

### Immediate (do first)
1. **CR-1** Apply `requireTier()` middleware to all dashboard routes
2. **CR-2** Add `adminAuth` middleware to backend proxy
3. **CR-3** Add `webhookAuth.calendar` to calendar webhook route
4. **CR-6** Remove access tokens from `CLAUDE.md`
5. **CR-5** Rotate all API keys in `.env`

### This Week
6. **CR-4 + H-3** Fail-closed on missing `ADMIN_API_KEY` in production
7. **CR-7** Add `clientId` enforcement to Backend BigQueryClient
8. **H-1** Add HMAC signature verification to transcript webhook
9. **H-2 + H-11** Use `crypto.timingSafeEqual` in all Backend secret comparisons
10. **H-4** Restrict CORS to known origins
11. **H-5** Enable CSP on Frontend
12. **H-7** Add `express-rate-limit` to both servers

### Next Sprint
13. **H-8 + H-9** Restrict cross-tenant closer queries
14. **H-14** Remove `--allow-unauthenticated` from Backend Cloud Run
15. **M-1 + M-2** Switch to allowlist pattern for mass assignment
16. **M-9** Check client status on token validation
17. **M-13** Replace `SELECT *` with explicit column lists
18. **M-15** Mask `transcript_api_key` before sending to frontend
19. **L-8 + L-13** Add `npm audit` to CI pipeline
