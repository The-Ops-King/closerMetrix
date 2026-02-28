# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

### Files
- **React Components:** PascalCase (`.jsx`) — `Scorecard.jsx`, `CloserFilter.jsx`, `DateRangeFilter.jsx`
- **Hooks:** camelCase (`.js`) — `useFilters.js`, `useAuth.js`, `useDataAnalysisInsight.js`
- **Utilities:** camelCase (`.js`) — `api.js`, `formatters.js`, `colors.js`
- **Services:** PascalCase (`.js`) — `CallStateManager.js`, `TranscriptService.js`, `AIProcessor.js`
- **Queries:** camelCase (`.js`) — `overview.js`, `financial.js`, `objections.js`
- **Routes:** camelCase (`.js`) — `backendProxy.js`, `dashboard.js`, `admin.js`
- **Middleware:** camelCase (`.js`) — `clientIsolation.js`, `tierGate.js`, `webhookAuth.js`
- **Config:** camelCase or UPPER_SNAKE_CASE — `index.js`, `insightEngine.js`, `OBJECTION_TYPES` (constants)

### Functions
- **camelCase, verb-first**
  - `getCloserByEmail()`, `updateCallState()`, `processTranscript()`
  - `createCallRecord()`, `matchTranscriptToCall()`, `resolveClientId()`
  - `evaluateTranscript()`, `buildPrompt()`, `normalizeEvent()`

### Variables
- **camelCase:** `clientId`, `closerId`, `prospectEmail`, `callRecord`, `isLoading`
- **Constants:** UPPER_SNAKE_CASE — `TRANSCRIPT_TIMEOUT_MINUTES`, `STATE_TRANSITIONS`, `FILTER_WORD`
- **Booleans, flags:** Prefix with `is` or `has` — `isAvailable`, `hasError`, `isLoading`, `shouldSkip`

### Types/Objects
- **PascalCase for class names:** `CallStateManager`, `TranscriptService`, `BigQueryClient`
- **PascalCase for interface/config objects:** `StandardTranscript`, `StandardCalendarEvent`
- **snake_case for database column names:** `client_id`, `appointment_date`, `transcript_status`, `call_type` (matches existing BigQuery schema)

### Route Paths
- **kebab-case:** `/webhooks/calendar`, `/api/admin/clients`, `/admin/clients/:clientId/closers`

## Code Style

### Formatting
- **No linter configured** — Follow these manual conventions:
  - 2-space indentation
  - Lines typically under 100 characters (readability over strict limits)
  - Always use semicolons (`;`) to end statements
  - Double quotes (`"`) for strings in JavaScript/TypeScript
  - Single quotes (`'`) for JSX attributes when necessary, but prefer double quotes in most code

### Variables
- **Use `const` by default** — Only `let` when the variable is reassigned; never `var`
- **Destructure imports and props:** `const { token, mode } = useAuth();`
- **Destructure function parameters where appropriate:** `({ clientId, closer_id }) => { ... }`

### Comments
- **Always JSDoc-comment functions** — Include what the function does, params, returns, and edge cases
- **Comment WHY, not WHAT** — Explain business logic, not obvious implementation
  - Good: `// Ignore closerId for Basic tier — they can't filter by person`
  - Bad: `// Set closerId to null`
- **Brief inline comments for non-obvious logic** — Use sparingly
- **TODO/FIXME comments:** Use when intentional — `// TODO: implement chatbot panel`

### Async/Await
- **Always use `async/await`** — No `.then()` chains
- **Always wrap async in try/catch** — Never leave promises unhandled
- **Error messages must include context:** `"Failed to fetch /admin/clients: {error}"`

### Error Handling
- **Catch every async operation:**
  ```javascript
  try {
    const result = await somethingAsync();
    return result;
  } catch (error) {
    logger.error('What failed and why', { context: error.message });
    // Respond appropriately (return null, rethrow, or handle)
  }
  ```
- **Client isolation is MANDATORY:** Every BigQuery query includes `client_id` parameter
  - **NEVER use string interpolation for SQL values**
  - **ALWAYS parameterize:** `WHERE client_id = @clientId`

### Logging
- **Use structured logging** — `logger.info('message', { context: 'data' })`
- **Include client_id in logs** when relevant: `{ clientId, callId, error }`
- **Severity levels:** `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`

## Import Organization

### Order (top to bottom)
1. **Node.js builtins:** `const fs = require('fs');`
2. **Third-party packages:** `const express = require('express');`, `import React from 'react';`
3. **Local utilities:** `const config = require('../config');`, `const { runQuery } = require('../db/BigQueryClient');`
4. **Relative imports:** `const CallStateManager = require('./CallStateManager');`
5. **Blank line between groups**

### Path Aliases
- **Frontend uses absolute imports from src root:**
  - `import { useAuth } from '../context/AuthContext';` ✓ (relative from same folder)
  - No `@/` alias configured — use explicit relative paths
- **Backend uses relative requires:**
  - `require('../config')` — relative paths, no alias system

### Destructuring
- **Prefer destructuring for exports:**
  ```javascript
  const { runQuery, table } = require('./BigQueryClient');
  const { token, mode } = useAuth();
  ```

## React Component Design

### Functional Components Only
- **No class components** — All React components are functional with hooks
- **One component per file** — Sub-components stay in the same file only if small (<50 lines)

### Props & JSDoc
- **Document all props with JSDoc:**
  ```javascript
  /**
   * Scorecard component for metric display.
   *
   * @param {string} label - Metric label ("Show Rate")
   * @param {number} value - The metric value (0.73)
   * @param {string} format - Format type: 'percent', 'currency', 'number', 'score'
   * @param {number} [delta] - Optional week-over-week change
   * @param {string} [glowColor] - Neon accent for border glow (default: cyan)
   * @param {boolean} [locked] - If true, shows lock icon + upgrade tooltip
   */
  export function Scorecard({ label, value, format, delta, glowColor, locked }) { ... }
  ```

### State Management
- **Use custom hooks for data fetching** — `useMetrics()`, `useFilters()`, `useAuth()`
- **Context is global state only** — `AuthContext`, `FilterContext`, `DataContext`
- **Lift state up if needed** — Only prop-drill if 2-3 levels deep; use Context for deeper trees
- **Module-level caching for expensive operations** — See `useDataAnalysisInsight.js` for cache Map pattern

### Styling
- **MUI theme system ONLY** — `sx` prop or `tronTheme.js`
- **NO inline style objects** — Use `sx={{ prop: value }}`
- **NO hardcoded hex codes** — Always use `COLORS.neon.*` or `COLORS.text.*` from `client/src/theme/constants.js`
- **Responsive with breakpoints:** `sx={{ xs: '100%', md: '50%' }}` for mobile-first design
- **Glow effects for Tron aesthetic:**
  ```javascript
  boxShadow: `0 0 20px ${COLORS.neon.cyan}, inset 0 0 10px rgba(...)`
  ```

### Component Patterns
- **Always handle loading/error/empty states** — Use `ChartWrapper` or custom error boundaries
- **Tier checks with `useTier()`:**
  ```javascript
  const { tier } = useTier();
  if (tier !== 'executive') return <LockedFeature />;
  ```
- **Filters via `FilterContext`:** `const { dateRange, closerId } = useFilters();`
- **Data via custom hooks:** `const { data, isLoading, error } = useMetrics('overview', {...})`

## Backend Patterns

### BigQuery Queries
- **EVERY query uses parameterized statements** — `@clientId`, `@dateStart`, etc.
- **NEVER string interpolation:**
  ```javascript
  // ❌ WRONG — SQL injection risk
  const query = `SELECT * FROM Calls WHERE client_id = '${clientId}'`;

  // ✅ RIGHT — parameterized
  const query = `SELECT * FROM Calls WHERE client_id = @clientId`;
  const rows = await bq.runQuery(query, { clientId });
  ```
- **`runQuery()` REQUIRES `clientId`** — throws if missing (client isolation enforcement)
- **`runAdminQuery()` spans clients** — caller must verify admin auth first
- **Use fully-qualified table names:**
  ```javascript
  const query = `SELECT * FROM \`closer-automation.CloserAutomation.Calls\`...`;
  // OR use the helper: bq.table('Calls') → `closer-automation.CloserAutomation.Calls`
  ```

### Service Layer (No Express req/res)
- **Services export pure functions** — no req/res objects passed in
- **Services handle business logic only** — validation, state management, DB queries
- **Route handlers call services** — orchestrate request → service → response
  ```javascript
  // ✓ Good: Service returns data
  const result = await callStateManager.handleCalendarEvent(event, clientId);

  // ✗ Bad: Service touches Express objects
  callStateManager.handleCalendarEvent(req, res);
  ```

### Webhook Handlers
- **Return 200 immediately** — queuing is optional but recommended
- **Process async** — use Google Cloud Tasks or in-memory queue
- **Validate authentication** — `X-Webhook-Secret` or per-client secret
- **Log all webhook failures** — audit trail for debugging
- **Idempotent by design** — duplicate webhooks should not create duplicates

### Error Responses
```javascript
// Client data issues
res.status(400).json({ error: 'Invalid payload', details: 'Missing field X' });

// Authentication/authorization
res.status(401).json({ error: 'Unauthorized', details: 'Invalid API key' });
res.status(403).json({ error: 'Forbidden', details: 'Client isolation violation' });

// Not found
res.status(404).json({ error: 'Not found', details: 'Client ABC not found' });

// Server errors
res.status(500).json({ error: 'Server error', details: 'BigQuery failed: ...' });
```

## Call State Machine & Lifecycle

### State Transitions
- **Call states defined in `config/attendance-types.js`**
- **Transitions enforced by `STATE_TRANSITIONS` object** in `CallStateManager.js`
- **Invalid transitions logged as audit entries** — never silent failures
- **Each transition includes trigger reason** — 'calendar_webhook', 'transcript_webhook', 'timeout', etc.

### Attendance Values
- `null` — New call, awaiting outcome determination
- `'Waiting for Outcome'` — Appointment time passed, transcript expected
- `'Show'` — Both parties showed, transcript received (triggers AI processing)
- `'Ghosted - No Show'` — No transcript or empty transcript after timeout
- `'Canceled'` — Calendar event deleted/canceled
- `'Rescheduled'` — Event moved to new time
- `'No Recording'` — System failure, recording not captured
- `'Overbooked'` — Closer was double-booked

### Call Outcome Values (from config)
- `'Closed - Won'` — Prospect committed and purchased
- `'Deposit'` — Partial payment received with intent to pay remainder
- `'Follow Up'` — Interested but didn't commit, another call expected
- `'Lost'` — Prospect declined
- `'Disqualified'` — Prospect doesn't meet criteria
- `'Not Pitched'` — Closer spoke with prospect but chose not to pitch

## Shared vs. Isolated Code

### Frontend-Backend Shared Code
- **Location:** `/shared/` directory
- **Examples:** Objection type definitions, tier constants, color maps
- **Pattern:** Imported by both Frontend and Backend without duplication
- **Keep in sync:** Any changes to shared enums must work in both contexts

### Database Column Names
- **Always snake_case** — matches BigQuery schema
- **No camelCase in DB fields** — even if JavaScript uses camelCase for the same data
- **Mapping layer:** Convert at query boundaries
  ```javascript
  // Database returns snake_case
  const row = { client_id: '...', prospect_email: '...' };
  // JavaScript uses camelCase
  const obj = { clientId: row.client_id, prospectEmail: row.prospect_email };
  ```

## Testing (see TESTING.md for full spec)

### Test File Naming
- **Scenarios:** `tests/scenarios/{scenario-name}.test.js`
- **Services:** `tests/services/{ServiceName}.test.js`
- **Routes:** `tests/routes/{route-name}.test.js`
- **Integration:** `tests/integration/{feature}.test.js`

### Mocking
- **Mock BigQuery:** Use `helpers/mockBigQuery.js` for in-memory tables
- **Mock external APIs:** Jest mocks at module level with `jest.mock()`
- **Test data:** Use `beforeEach` to seed mock data, `afterEach` to reset

## Special Patterns

### Soft Deletes (No Deletes)
- **Never `DELETE` from BigQuery** — Set `status: 'inactive'` instead
- **Queries filter on status:** `WHERE status = 'active'`
- **Audit log preserves deletion intent** — logged as state change

### Timestamp Handling
- **Always UTC** — Store as `TIMESTAMP` (BigQuery) or ISO 8601 strings
- **Convert to client timezone only for display** — use `dayjs` with client's `timezone` field
- **Never store timezone-adjusted timestamps** — causes confusion and bugs

### JSON Fields (BigQuery)
- **Use JSON type for flexible data** — e.g., `objections_json`, `key_moments`
- **Always validate structure** — don't assume client data is well-formed
- **Extract specific fields in queries when performance matters** — `JSON_EXTRACT(objections_json, '$.type')`

### Parameterized Queries (CRITICAL)
```javascript
// ✅ ALWAYS PARAMETERIZED
const query = `
  SELECT * FROM \`closer-automation.CloserAutomation.Calls\`
  WHERE client_id = @clientId AND appointment_date >= @dateStart
`;
const params = { clientId: 'abc123', dateStart: '2026-01-01' };
const rows = await bq.runQuery(query, params);

// ❌ NEVER INTERPOLATION
const query = `SELECT * FROM Calls WHERE client_id = '${clientId}'`; // WRONG!
```

---

*Convention guide: [analysis date]*
