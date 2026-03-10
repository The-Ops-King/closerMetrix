# Database Reference

## BigQueryClient (Frontend — `Frontend/server/db/BigQueryClient.js`)

| Method | Signature | Notes |
|--------|-----------|-------|
| `runQuery` | `(sql, params) → Promise<Array>` | **Throws** if `params.clientId` missing |
| `runAdminQuery` | `(sql, params?) → Promise<Array>` | No clientId requirement; caller verifies admin auth |
| `isAvailable` | `() → boolean` | False = demo mode (returns empty arrays) |
| `table` | `(name) → string` | Returns backtick-quoted full path |

## BigQueryClient (Backend — `Backend/src/db/BigQueryClient.js`)

| Method | Signature | Notes |
|--------|-----------|-------|
| `query` | `(sql, params) → Promise<Array>` | Destructures `[rows]` internally |
| `insert` | `(tableName, row) → void` | DML INSERT (not streaming). Strips null fields. Objects → `PARSE_JSON()` |
| `update` | `(tableName, updates, where) → void` | Null values → literal `NULL` in SQL |
| `table` | `(name) → string` | Same as Frontend |
| `healthCheck` | `() → boolean` | `SELECT 1` |

## Frontend Query Files (`Frontend/server/db/queries/`)

| File | Export | Views/Tables Hit |
|------|--------|-----------------|
| `helpers.js` | `VIEW, buildBaseWhere, buildQueryContext, timeBucket, runParallel, num, rate` | `v_calls_joined_flat_prefixed` |
| `overview.js` | `getOverviewData(clientId, filters, tier)` | VIEW |
| `financial.js` | `getFinancialData(clientId, filters, tier)` | VIEW |
| `attendance.js` | `getAttendanceData(clientId, filters, tier)` | VIEW |
| `callOutcomes.js` | `getCallOutcomesData(clientId, filters, tier)` | VIEW |
| `salesCycle.js` | `getSalesCycleData(clientId, filters, tier)` | VIEW + `v_close_cycle_stats_dated` |
| `objections.js` | `getObjectionsData(clientId, filters, tier)` | VIEW + objection views |
| `adherence.js` | `getAdherenceData(clientId, filters, tier)` | VIEW + `Calls` (for scores) |
| `violations.js` | `getViolationsData(clientId, filters, tier)` | `Calls` + `Closers` (direct, not view) |
| `projections.js` | `getProjectionsData(clientId, filters, tier)` | VIEW |
| `settings.js` | settings CRUD | `Clients` (reads/writes `settings_json`) |
| `insightLog.js` | `getLatestInsight, insertInsight, countRecentOnDemand, ...` | `InsightLog` |
| `activityLog.js` | `insertActivity(row)` | `ClientActivityLog` |
| `rawData.js` | `getRawData(clientId, filters, tier)` | VIEW |

## Backend Query Files (`Backend/src/db/queries/`)

| File | Key Methods | Table |
|------|-------------|-------|
| `calls.js` | `findByAppointmentId, findById, findForTranscriptMatch, countPriorShows, findStuckScheduled, create, update` | `Calls` (+JOIN `Closers`) |
| `clients.js` | `findById, list, create, update` | `Clients` |
| `closers.js` | `findByWorkEmail, listByClient, create, update` | `Closers` |
| `objections.js` | `findByCallId, createMany, deleteByCallId` | `Objections` |
| `prospects.js` | `findByEmail, findById, create, update` | `Prospects` |
| `audit.js` | `create, findByEntity, findByClient` | `AuditLog` |

## Prefixed Column Names (`v_calls_joined_flat_prefixed`)

```
calls_appointment_date    calls_attendance          calls_call_id
calls_call_outcome        calls_call_source         calls_call_type
calls_cash_collected      calls_client_id           calls_close_attempt_score
calls_closer_id           calls_compliance_flags    calls_discovery_score
calls_duration_minutes    calls_goal_score          calls_intro_score
calls_lost_reason         calls_objection_handling_score
calls_overall_call_score  calls_pain_score          calls_payment_plan
calls_pitch_score         calls_product_purchased   calls_prospect_email
calls_prospect_fit_score  calls_prospect_name       calls_recording_url
calls_revenue_generated   calls_script_adherence_score
calls_transcript_link     calls_transition_score    calls_key_moments
closers_name              clients_client_id
```

## Schema Quirks

- `appointment_date` = **TIMESTAMP**. BQ SDK returns as `{ value: '...' }` — normalize with `toISO()`
- `appointment_end_date` = **STRING**. Must `SAFE_CAST(appointment_end_date AS TIMESTAMP)` in queries
- Score columns (e.g. `calls_script_adherence_score`) require `CAST(... AS FLOAT64)` for aggregation
- Revenue/cash columns require `CAST(... AS FLOAT64)` for `SUM`/`SAFE_DIVIDE`
- `compliance_flags` is a JSON string — query with `JSON_EXTRACT_ARRAY(..., '$.flags')` + `CROSS JOIN UNNEST`
- `v_calls_joined_flat_prefixed` is an explicit column list — new Calls columns don't auto-appear
- Backend `insert()` uses DML (not streaming) — no 90-minute buffer delay
- Backend `insert()` strips null/undefined fields; objects → `PARSE_JSON(@col)`
- Frontend `runQuery()` returns array directly. Don't destructure: `const rows = await bq.runQuery(...)` not `const [rows] = ...`
- `closerId` filter is comma-separated → split into array → `IN UNNEST(@closerIds)`. Basic tier always nullifies it
