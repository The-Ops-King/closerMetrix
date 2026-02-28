# Codebase Concerns

**Analysis Date:** 2026-02-28

## Tech Debt

**Incomplete BigQuery Abstraction:**
- Files: `Frontend/server/db/BigQueryClient.js`, `Frontend/server/db/queries/overview.js` (line 108)
- Issue: The BigQueryClient returns empty arrays when credentials are unavailable (demo mode). This works for development, but creates a fragile "happy path" where demo data can mask real query bugs. Demo tokens (`demo-basic`, `demo-insight`, `demo-executive`) route to hardcoded `DEMO_CLIENTS` in `tokenManager.js` (lines 25-56), which provides fake closer lists that don't match real data structure. When testing with real tokens, the system works correctly, but real BigQuery bugs can remain undetected until production.
- Impact: Tyler has noted in CLAUDE.md: "NEVER test with demo tokens — Demo data uses hardcoded fake values that can mask real bugs (wrong column names, missing BQ fields, broken queries)." This is a known workaround, not a solution.
- Fix approach: Remove demo data entirely or make it structurally identical to real data. Either way, always test with real BigQuery credentials.

**BigQuery Column Naming Inconsistency:**
- Files: `Frontend/server/db/queries/*.js` (all 14 query files)
- Issue: The BigQuery view `v_calls_joined_flat_prefixed` uses prefixed column names (`calls_*`, `closers_*`, `clients_*`, `obj_*`). However, when the view schema changes or columns are added, the frontend must manually update `CREATE OR REPLACE VIEW` statements. New columns on the base `Calls` table do NOT auto-appear in the view. This has caused bugs where a query references a column that doesn't exist in the view.
- Impact: Queries can fail silently or return NULL values for missing columns. The CLAUDE.md explicitly states (line 1103): "**BQ view is explicit column list** — new columns on Calls table do NOT auto-appear in `v_calls_joined_flat_prefixed`. Must `CREATE OR REPLACE VIEW` to add them."
- Fix approach: Audit the view schema against the base Calls table. Create a migration script or documentation that lists all available prefixed columns. When adding a new metric to a page, verify the column exists in the view before writing the query.

**Hardcoded Admin API Key:**
- Files: `Frontend/server/config/index.js` (line 25)
- Issue: `adminApiKey` defaults to `'dev-admin-key'` in development. In production, this should be a long random string stored as an env var. If someone forgets to set `ADMIN_API_KEY` before deploying, the default key is exposed.
- Impact: Potential unauthorized admin access if env var is not configured.
- Fix approach: Require `ADMIN_API_KEY` env var in production (throw error if missing). In development, log a warning with the default key being used.

## Known Bugs

**Fire-and-Forget Token Update Can Fail Silently:**
- Files: `Frontend/server/utils/tokenManager.js` (lines 139-147)
- Issue: When a token is validated, the `last_accessed_at` timestamp is updated via an async call that is NOT awaited. If the update fails, the error is logged but the validation still succeeds. Over time, this means `last_accessed_at` can become stale or inaccurate, making it impossible to track token usage reliably.
- Symptoms: Admin viewing TokenManager sees old `last_accessed_at` values for actively-used tokens.
- Workaround: The field is informational only—not used for revocation logic.
- Fix approach: Decide whether `last_accessed_at` is critical. If yes, await the update or retry on failure. If no, remove it.

**Insight Engine Fails Gracefully (No Feedback to User):**
- Files: `Frontend/server/services/insightEngine.js`, `Frontend/server/routes/dashboard.js` (line 706+)
- Issue: When the Insight Engine (Claude API) fails to generate insights, the endpoint catches the error and returns an empty insight string. The frontend has no way to know if the insight is "loading", "failed", or "not configured". This is especially problematic for the Data Analysis page, which relies heavily on insights.
- Impact: Users see blank insight cards with no indication of why. They might think the page is broken or that there's no data.
- Fix approach: Return explicit status in the response: `{ text: '...', status: 'success' | 'loading' | 'error', error?: string }`. Update the frontend to show a loading skeleton while generating and an error message if it fails.

**Cache Key Collision Possible in Insight Engine:**
- Files: `Frontend/server/services/insightEngine.js` (lines 40-43)
- Issue: The cache key uses MD5 hash of metrics (line 42). MD5 collisions are theoretically possible (though rare). If two different metric objects hash to the same value, they'll use the same cached insight, leading to incorrect data served to different clients.
- Impact: Unlikely but catastrophic if it happens—one client gets another client's insight.
- Fix approach: Use a stronger hash (SHA-256) or include section + clientId in the key directly (line 142 already does this correctly, but relying on MD5 is fragile).

**Promise.all Cascading Failures in Fetch Chains:**
- Files: `Frontend/server/routes/dashboard.js` (many endpoints use parallel queries)
- Issue: Per CLAUDE.md memory: "Promise.all for independent fetches can cascade failures. Use separate try/catch for independent data (e.g., tokens vs clients in TokenManager)." The dashboard endpoints fetch multiple independent data sets (scorecards, charts, tables). If one fetch fails, the entire endpoint returns an error. This is especially problematic for optional features like insights.
- Impact: If the Insight Engine fails, the entire dashboard endpoint fails, even though insights are optional.
- Fix approach: Fetch independent data in separate try/catch blocks. Return partial data if some fetches fail. Example: insights fail but charts/tables still load.

## Security Considerations

**Client Isolation Enforcement is Three-Layered (Good) but Complex:**
- Files: `Frontend/server/middleware/clientIsolation.js`, `Frontend/server/db/BigQueryClient.js`, `Frontend/server/db/queries/*.js`
- Risk: The isolation relies on three separate enforcement points: token validation → clientId injection → parameterized queries. If any layer fails, data leaks. The BigQueryClient requires clientId parameter (throws if missing), which is the safety net. However, query files are hand-written, and developers must remember to include `WHERE client_id = @clientId` in every query.
- Current mitigation: BigQueryClient.runQuery() throws if clientId is missing (line 109). All query files manually include WHERE clauses.
- Recommendation: This is defense-in-depth, which is good. Keep it as-is, but document that any new query file MUST include the WHERE clause or the app will break.

**Admin API Key in Transit:**
- Files: `Frontend/server/routes/backendProxy.js` (lines 38-43)
- Risk: The admin key is sent in the `X-Admin-Key` header from the React client, converted to `Authorization: Bearer` header for the Backend API. This is only safe over HTTPS. If HTTP is used, the key is exposed.
- Current mitigation: Cloud Run enforces HTTPS.
- Recommendation: Add a check in the development server to warn if running over HTTP with an admin key in use.

**Anthropic API Key Exposure Risk:**
- Files: `Frontend/server/config/index.js` (line 34)
- Risk: The Anthropic API key is loaded from `ANTHROPIC_API_KEY` env var. If this env var is logged or exposed in error messages, the key leaks.
- Current mitigation: The config file is not logged. Error messages in `insightEngine.js` don't expose the key.
- Recommendation: Ensure the key is never logged, even in debug mode. Consider storing it separately from other config (e.g., mounted secrets instead of env vars).

## Performance Bottlenecks

**Large Query Files Not Optimized for Readability:**
- Files: `Frontend/server/db/queries/callOutcomes.js` (723 lines), `Frontend/server/db/queries/rawData.js` (641 lines), `Frontend/server/db/queries/overview.js` (616 lines)
- Problem: Some query files are 600+ lines and contain multiple related queries. This makes them hard to navigate and modify. For example, `callOutcomes.js` contains the main query, a demo data generator, and multiple helper functions all in one file.
- Impact: Developers spend time scrolling to find the right function. Easy to miss edge cases or duplicate logic.
- Fix approach: Split large query files into smaller modules. Example: `callOutcomes.js` → `callOutcomes/index.js` (main export), `callOutcomes/queries.js`, `callOutcomes/demo.js`.

**Insight Cache is In-Memory Only:**
- Files: `Frontend/server/services/insightEngine.js` (lines 33-34)
- Problem: The cache is a JavaScript Map in memory. When the server restarts, the cache is lost. Every request after restart will hit the Claude API, potentially costing more and slowing down dashboard loads. There's no persistence.
- Impact: Unnecessary API calls and costs after server restarts.
- Fix approach: Use a fast external cache (Redis, Memcached) or a BigQuery table for insight caching. The in-memory cache is fine for development, but production should persist.

**Demo Data Generation Happens at Request Time:**
- Files: `Frontend/server/db/queries/overview.js` (lines 282+, `getDemoData()`), similar in all query files
- Problem: Every request to a query file when BigQuery is unavailable generates demo data on-the-fly. For a page with 9+ scorecards and 5+ charts, this means computing hundreds of fake metrics per request.
- Impact: Slower response times during demo mode. The functions like `seededRandom()` (line 82) are called many times per request.
- Fix approach: Pre-compute demo data once at startup, cache it in memory. Or, move demo data to a shared demo dataset in BigQuery.

**Insight Log Queries Use LIMIT 1 Without Index:**
- Files: `Frontend/server/db/queries/insightLog.js` (lines 32, 141)
- Problem: The queries to fetch the latest insight for a date use `LIMIT 1` but don't specify an `ORDER BY` direction. BigQuery doesn't guarantee which row is returned, and without an index on `(client_id, section, generated_at)`, the query may be slow.
- Impact: Unpredictable performance when fetching insights for the Data Analysis page.
- Fix approach: Add explicit `ORDER BY generated_at DESC` to ensure the most recent insight is returned. Create a BigQuery index on `(client_id, section, generated_at DESC)`.

## Fragile Areas

**Data Analysis Page Depends on Insight Log Table Existing:**
- Files: `Frontend/client/src/pages/client/DataAnalysisPage.jsx`, `Frontend/server/db/queries/insightLog.js`
- Why fragile: The page renders insight cards for each team member and the team overall. These insights come from the `InsightLog` table in BigQuery. If the table doesn't exist, the page fails. If the daily insight generation job fails, insights are stale. If insights take too long to generate, users see a blank page.
- Safe modification: Always check if the InsightLog table exists before querying. Implement a fallback mechanism: if insights are missing, show a "generating insights..." state or use older cached insights. Add monitoring/alerting for the daily job.
- Test coverage: The page has no tests. Add unit tests for the useDataAnalysisInsight hook to verify it handles missing data gracefully.

**Projections Page Calculation Math is Complex and Untested:**
- Files: `Frontend/server/db/queries/projections.js` (line 407+, `calculateProjections()`), `Frontend/client/src/utils/computePageData.js` (projections section)
- Why fragile: The projections use ratio-based adjustments (pR, sR, cR, dR, caR) and apply them cumulatively. The math is correct per CLAUDE.md and the reference projections app, but a small error in the formula (e.g., wrong order of operations) produces silently wrong results. There are no unit tests verifying the calculations.
- Safe modification: Add comprehensive unit tests for all ratio calculations and edge cases (e.g., zero close rate, missing baseline). Document the formula clearly with examples.
- Test coverage: Missing.

**Closer Filter is Hidden for Basic Tier but API Can Still Receive closerId:**
- Files: `Frontend/client/src/components/filters/CloserFilter.jsx`, `Frontend/server/db/queries/*.js`
- Why fragile: The Closer Filter is only shown for Insight+ tiers. But if a Basic tier client somehow sends a `closerId` query param (or a malicious actor tampers with the request), the backend currently accepts it. Per CLAUDE.md: "Basic tier always null" but this isn't enforced at the API level, only at the middleware/query level.
- Safe modification: Add explicit tier gating in each query file. Throw an error or log a warning if a Basic tier client requests a specific closerId. The middleware should prevent this, but the queries should also enforce it as a safety net.
- Test coverage: No tests for tier enforcement.

**Objection Type Filter Uses Alias Matching:**
- Files: `Frontend/server/db/queries/objections.js` (line 60+)
- Why fragile: The code maps user-selected objection types to database values using alias matching. If the alias list is incomplete or out of sync with the database, objections won't filter correctly. This is mentioned in a recent commit: "Standardize objection types with alias matching and dynamic filters."
- Safe modification: Audit the alias list against all objection types in the Calls table. Create a test that verifies all known objection types have an alias. If a new objection type is added to the database, add its alias immediately.
- Test coverage: Missing.

## Scaling Limits

**In-Memory Cache for Insights Doesn't Scale:**
- Problem: The cache is a JavaScript Map that grows unbounded. With 1000+ clients and 9 sections per page, this could grow to 9000+ entries. Each entry includes the full insight text and JSON, which could be 10KB+. This means the cache could grow to 90MB+ per server instance.
- Limit: With multiple Cloud Run instances and no shared cache, each instance has its own cache. Cross-instance cache hits are impossible.
- Scaling path: Move to Redis or Memcached for cross-instance caching. Or implement a distributed cache via BigQuery.

**BigQuery Quotas Not Managed:**
- Problem: There's no rate limiting or quota management on BigQuery queries. If a client repeatedly refreshes the dashboard, each refresh hits BigQuery. With 100+ clients, this could quickly exhaust daily query quotas or incur high costs.
- Limit: GCP BigQuery has quotas for concurrent queries, API calls, and data scanned. These are not monitored in the app.
- Scaling path: Add query cost tracking. Implement caching (Redis) to reduce database hits. Consider a webhook-based data refresh (push updates) instead of pull-based (client polling).

**Dashboard Endpoints Return All Data (No Pagination):**
- Problem: The `/api/dashboard/*` endpoints return all data for the date range in a single response. For a page with 10K+ calls, this could mean returning 10K+ rows in a JSON array. The response could be several MB, and the client must parse all of it even if it only displays 100 rows.
- Limit: Response size and parse time become bottlenecks with large datasets.
- Scaling path: Add server-side pagination to table endpoints (e.g., `?page=1&limit=100`). Implement virtual scrolling on the frontend.

**AI Insight Generation is Synchronous (Blocks Requests):**
- Problem: When insights need to be generated, the dashboard endpoint waits for the Claude API call to complete before returning. If the API takes 10+ seconds, the client times out.
- Limit: API response time is limited by Claude's latency.
- Scaling path: Generate insights asynchronously (background job) and return stale insights immediately if fresh ones aren't ready. Use WebSockets or polling to notify the client when fresh insights arrive.

## Dependencies at Risk

**Anthropic SDK Version Locked (Possible Drift):**
- Risk: The `@anthropic-ai/sdk` package is pinned to a specific version in `Frontend/package.json`. If a critical security fix is released, the app must be manually updated and redeployed. The SDK API could change with a major version bump.
- Impact: Security vulnerabilities in the SDK could go unpatched. The app could break if the API changes.
- Migration plan: Monitor the SDK release notes. When a security update is available, test it in staging before deploying to production. Consider automating security updates via dependabot.

**MUI X Charts is a Paid Component Library (with free tier):**
- Risk: MUI X Charts includes free components (LineChart, BarChart, PieChart) and paid components (DataGrid, DatePicker for some features). If the pricing model changes or free tier is removed, the app could break.
- Impact: Unplanned costs or forced migration to a different charting library.
- Migration plan: Monitor MUI's pricing and license changes. Keep a fallback charting library (recharts, visx) in mind. The current implementation uses only free components, so the risk is low.

**Google BigQuery SDK is Stable:**
- Risk: Low. The SDK is mature and stable. Google maintains it well.
- Impact: None expected.

## Missing Critical Features

**No Query Cost Tracking:**
- Problem: The app has no way to track how many queries are executed or their cost. With hundreds of clients and multiple dashboards refreshing, BigQuery costs could spike unexpectedly.
- Blocks: Cost management and forecasting.
- Recommendation: Add a query cost tracking layer. Intercept all `bq.runQuery()` calls and log the cost. Display total daily/monthly costs in the admin dashboard.

**No Request Rate Limiting:**
- Problem: There's no rate limiting on the `/api/dashboard/*` endpoints. A malicious actor could hammer the API to cause a denial-of-service or rack up costs.
- Blocks: API protection.
- Recommendation: Add rate limiting via Express middleware (e.g., `express-rate-limit`) or Cloud Run policies. Limit to 100 requests per minute per token.

**No Comprehensive Monitoring / Alerting:**
- Problem: The app logs errors, but there's no centralized monitoring or alerting system. If the Insight Engine fails repeatedly, no one is notified.
- Blocks: Operational visibility.
- Recommendation: Integrate with Google Cloud Logging or a third-party service (Sentry, DataDog). Set up alerts for critical errors (BigQuery failures, API timeout, insight generation failures).

## Test Coverage Gaps

**No Tests for Data Isolation (CRITICAL):**
- What's not tested: Whether a token for Client A can access data from Client B. Whether a Basic tier client can force access to Insight-tier data by sending a closerId param.
- Files: `Frontend/server/middleware/clientIsolation.js`, all query files
- Risk: Data leaks are the worst-case scenario. Without tests, this could go undetected until a security audit.
- Priority: **High**
- Recommendation: Write comprehensive tests for the clientIsolation middleware. For each query file, write tests that verify a random clientId in the params returns only that client's data. Write tests that verify Basic tier clients can't access restricted pages.

**No Tests for Insight Generation:**
- What's not tested: Whether insights are cached correctly, whether the cache expires properly, whether the AI API failure is handled gracefully.
- Files: `Frontend/server/services/insightEngine.js`
- Risk: Silent failures (stale cache, bad API responses) that affect user experience.
- Priority: **Medium**
- Recommendation: Mock the Anthropic client. Test cache hit/miss, expiration, error handling. Test edge cases (empty metrics, invalid section, API timeout).

**No Tests for Projection Calculations:**
- What's not tested: The ratio-based projection math. Edge cases like zero close rate, negative values, missing baseline data.
- Files: `Frontend/server/db/queries/projections.js`, `Frontend/client/src/utils/computePageData.js`
- Risk: Silent math errors producing wrong projections for clients.
- Priority: **High**
- Recommendation: Write unit tests for all projection functions. Test with known inputs and expected outputs. Test edge cases.

**No Tests for Tier Gating:**
- What's not tested: Whether pages are correctly hidden/shown based on tier. Whether API endpoints return 403 for unauthorized tiers.
- Files: `Frontend/client/src/components/TierGate.jsx`, middleware/tierGate.js
- Risk: Tier boundaries could be porous, allowing Basic clients to see Insight/Executive content.
- Priority: **High**
- Recommendation: Write tests for each tier. Verify Basic client sees only Overview. Verify Insight client sees Overview + 6 other pages. Verify Executive client sees all 9 pages.

**No E2E Tests (Playwright) for Critical Flows:**
- What's not tested: Full user journeys (login → view dashboard → filter → export data). These are mentioned in CLAUDE.md as Playwright URLs but not implemented.
- Files: All client pages, API routes
- Risk: UI bugs, API contract mismatches, and data flow errors could make it to production.
- Priority: **Medium**
- Recommendation: Add Playwright tests for Overview page load, Financial page filtering, Violations page viewing. Use the real test token: `af3016c9-5377-43f3-9d16-03428af0cc4d`.

---

*Concerns audit: 2026-02-28*
