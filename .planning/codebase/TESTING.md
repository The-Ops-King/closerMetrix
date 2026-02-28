# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

### Runner
- **Jest** (Node.js backend)
- **No frontend test framework** — React components tested manually with Playwright (E2E)

### Configuration
- **Backend:** `Backend/package.json` includes Jest config
  ```json
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"],
    "coverageDirectory": "coverage",
    "collectCoverageFrom": ["src/**/*.js", "!src/index.js"]
  }
  ```
- **Frontend:** No Jest setup — uses Playwright for E2E testing

### Run Commands (Backend)
```bash
npm test                  # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run lint             # Run ESLint (if configured)
```

## Test File Organization

### Location Pattern
```
Backend/tests/
├── scenarios/           # The 48 scenario tests (call lifecycle)
├── services/            # Unit tests for each service
├── routes/              # Route handler tests
├── integration/         # End-to-end pipeline tests
└── helpers/             # Mock utilities and test fixtures
```

### Naming Convention
- **Scenario tests:** `tests/scenarios/{scenario-name}.test.js`
  - Example: `tests/scenarios/ghosted-no-show.test.js`
  - One scenario per file for clarity
- **Service tests:** `tests/services/{ServiceName}.test.js`
  - Example: `tests/services/CallStateManager.test.js`
- **Route tests:** `tests/routes/{route-name}.test.js`
  - Example: `tests/routes/calendar-webhook.test.js`
- **Integration tests:** `tests/integration/{feature}.test.js`
  - Example: `tests/integration/full-pipeline.test.js`

### Test Data Structure
```
tests/
├── fixtures/            # Sample payloads (JSON files)
│   ├── fathom-webhook.json
│   ├── google-calendar-created.json
│   ├── payment-webhook.json
│   └── otter-webhook.json
└── helpers/
    ├── mockBigQuery.js   # In-memory BigQuery mock
    └── factories.js      # Test data generators
```

## Test Structure

### Jest Test Suite Pattern
```javascript
/**
 * SCENARIO: X — Description
 *
 * Tests the specific scenario from the 48-scenario spec.
 * Setup, trigger, verify BigQuery state, verify audit log.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const { someService } = require('../../src/services/SomeService');
const mockBQ = require('../helpers/mockBigQuery');

beforeEach(() => {
  mockBQ._reset();  // Clear mock state between tests
});

describe('Scenario X: Call Scheduled Then Canceled', () => {
  it('should create call record when event arrives', async () => {
    // Arrange: Set up initial state
    const event = { eventId: 'abc', title: 'Discovery', status: 'confirmed' };

    // Act: Trigger the behavior
    const result = await someService.process(event);

    // Assert: Verify the state changed
    expect(result.action).toBe('created');
    expect(result.callRecord.attendance).toBeNull();

    // Verify database state
    const calls = mockBQ._getTable('Calls');
    expect(calls).toHaveLength(1);
  });

  it('should update call to canceled when event is deleted', async () => {
    // Arrange: Seed existing call
    mockBQ._seedTable('Calls', [{
      call_id: 'call_001',
      appointment_id: 'abc',
      attendance: null,
    }]);

    // Act: Delete event
    const event = { eventId: 'abc', status: 'cancelled' };
    const result = await someService.process(event);

    // Assert: Verify state transition
    expect(result.action).toBe('updated');
    expect(result.callRecord.attendance).toBe('Canceled');

    // Verify audit log
    const auditLog = mockBQ._getTable('AuditLog');
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].new_value).toBe('Canceled');
  });
});
```

### Essential Sections in Each Test
1. **Describe block:** Scenario name + what's being tested
2. **beforeEach:** Reset mock state
3. **Arrange:** Set up test data (create fixtures, seed DB)
4. **Act:** Call the function/service being tested
5. **Assert:** Verify return value, database state, and side effects

## Mocking

### Mock BigQuery (mockBigQuery.js)
The mock implementation simulates BigQuery with in-memory tables:

```javascript
// Mock provides these methods:
mockBQ._reset()              // Clear all tables
mockBQ._seedTable(name, rows)  // Pre-populate a table
mockBQ._getTable(name)       // Retrieve rows for assertions
mockBQ._getCalls()           // Shortcut for _getTable('Calls')
mockBQ._getAuditLog()        // Shortcut for _getTable('AuditLog')
```

### Usage Pattern
```javascript
const mockBQ = require('../helpers/mockBigQuery');

beforeEach(() => {
  mockBQ._reset();
});

it('should insert call', async () => {
  // Seed a closer
  mockBQ._seedTable('Closers', [{
    closer_id: 'closer_1',
    work_email: 'sarah@example.com',
    status: 'active',
  }]);

  // Run test
  const result = await callStateManager.createCall({...});

  // Verify database state
  expect(mockBQ._getCalls()).toHaveLength(1);
  expect(mockBQ._getCalls()[0].closer_id).toBe('closer_1');
});
```

### Mocking External APIs
```javascript
jest.mock('../../src/services/AIProcessor', () => ({
  analyze: jest.fn().mockResolvedValue({
    call_outcome: 'Closed - Won',
    scores: { discovery: 8, pitch: 7 },
  }),
}));

// In test:
const result = await someService.process(transcript);
expect(AIProcessor.analyze).toHaveBeenCalledWith(transcript);
```

### Mocking Dates
```javascript
const now = new Date('2026-02-16T15:00:00Z');
jest.useFakeTimers();
jest.setSystemTime(now);

// Test code runs with fixed time
const timestamp = new Date(); // Will be the fixed time
```

## Fixtures and Factories

### Using JSON Fixtures
```javascript
// tests/fixtures/google-calendar-created.json
{
  "eventId": "abc123",
  "eventType": "created",
  "title": "Discovery Call",
  "startTime": "2026-02-16T15:00:00Z",
  ...
}

// In test:
const fixture = require('../fixtures/google-calendar-created.json');
const result = await calendarService.handleEvent(fixture);
```

### Test Data Factories
```javascript
// tests/helpers/factories.js
function makeCall(overrides = {}) {
  return {
    call_id: 'call_123',
    client_id: 'client_abc',
    appointment_date: '2026-02-16T15:00:00Z',
    attendance: null,
    ...overrides,
  };
}

function makeTranscript(overrides = {}) {
  return {
    closerEmail: 'closer@example.com',
    prospectEmail: 'prospect@example.com',
    transcript: 'Full conversation text...',
    ...overrides,
  };
}

// In test:
const call = makeCall({ attendance: 'Show' });
const transcript = makeTranscript({ closerEmail: 'sarah@example.com' });
```

## Coverage

### Target (No Enforcement)
- No strict coverage minimums configured
- Aim for: Core services >80%, routes >75%, scenarios 100%
- Coverage run: `npm run test:coverage` → generates `coverage/` report

### View Coverage
```bash
npm run test:coverage
open coverage/lcov-report/index.html  # Open in browser
```

## Test Types

### Unit Tests
**Scope:** Single function/service in isolation
**Mocking:** Everything external (DB, APIs, filesystem)
**Example:** `CallStateManager.test.js`

```javascript
describe('CallStateManager.determineCallType', () => {
  it('should return First Call for new prospect', async () => {
    mockBQ._seedTable('Calls', []); // Empty history
    const type = await callStateManager.determineCallType('new@example.com', 'client_1');
    expect(type).toBe('First Call');
  });

  it('should return Follow Up for prospect with prior show', async () => {
    mockBQ._seedTable('Calls', [{
      prospect_email: 'returning@example.com',
      attendance: 'Show',
      client_id: 'client_1',
    }]);
    const type = await callStateManager.determineCallType('returning@example.com', 'client_1');
    expect(type).toBe('Follow Up');
  });
});
```

### Integration Tests
**Scope:** Multiple services working together
**Mocking:** Mock BigQuery, real service logic
**Example:** `full-pipeline.test.js`

```javascript
describe('Integration: Full Call Processing Pipeline', () => {
  it('should process calendar event → transcript → AI → BigQuery', async () => {
    // 1. Calendar event arrives
    const calendarEvent = { eventId: 'abc', title: 'Discovery', ... };
    const calendarResult = await calendarService.handleEvent(calendarEvent);
    expect(calendarResult.action).toBe('created');

    // 2. Transcript arrives
    const transcript = { closerEmail: 'closer@example.com', ... };
    const transcriptResult = await transcriptService.handleTranscript(transcript);
    expect(transcriptResult.action).toBe('matched');

    // 3. AI processing completes
    // (can be stubbed or real depending on test)

    // 4. Verify final BigQuery state
    const calls = mockBQ._getCalls();
    expect(calls[0].call_outcome).toBe('Closed - Won'); // or whatever
  });
});
```

### Scenario Tests (48 Total)
**Scope:** Specific behavior from the scenario spec
**Mocking:** Full mock (BigQuery + external APIs)
**Location:** `tests/scenarios/`
**Pattern:** One scenario per file

Examples that exist or should exist:
- `tests/scenarios/scheduled-then-canceled.test.js` — Scenario 1
- `tests/scenarios/ghosted-no-show.test.js` — Scenarios 2, 18
- `tests/scenarios/reschedule-logic.test.js` — Scenarios 3, 3.5, 8
- `tests/scenarios/call-held-ai-outcome.test.js` — Scenario 4
- `tests/scenarios/prospects-no-shows-system-glitch.test.js` — Scenario 5
- ... (through Scenario 48)

Each scenario file contains one or more test cases that verify the behavior described in the 48-scenario spec.

### E2E Tests (Frontend)
**Framework:** Playwright
**Location:** `.playwright-mcp/` (if configured) or manual testing
**Scope:** Real browser, real API, real BigQuery
**Run:** `playwright test` (if installed)

**Verification URLs (for manual testing):**
```
http://localhost:5173/d/{token}           # Client dashboard
http://localhost:5173/admin               # Admin dashboard
http://localhost:3001/api/health          # Backend health
```

**Key manual tests:**
- Calendar event → call appears in dashboard
- Transcript arrives → AI processes, outcome shows
- Payment webhook → call updates to "Closed - Won"
- Client isolation → client can't see other client's data

## Common Patterns

### Async Testing
```javascript
it('should handle async operation', async () => {
  // Use async/await
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});

// For promises:
it('should return promise', () => {
  return someAsyncFunction().then(result => {
    expect(result).toBeDefined();
  });
});
```

### Error Testing
```javascript
it('should throw when required field missing', async () => {
  const payload = { /* missing field */ };
  await expect(service.process(payload)).rejects.toThrow('Missing field X');
});

it('should return 400 for invalid payload', async () => {
  const response = await fetch('/api/webhook', { body: '{}' });
  expect(response.status).toBe(400);
});
```

### Parameterized Tests (Multiple Cases)
```javascript
const testCases = [
  { input: 'Financial', expected: 'financial' },
  { input: 'Think About It', expected: 'think_about' },
  { input: 'Unknown Type', expected: 'other' },
];

testCases.forEach(({ input, expected }) => {
  it(`should normalize objection type "${input}" to "${expected}"`, async () => {
    const result = normalizeObjectionType(input);
    expect(result).toBe(expected);
  });
});
```

### Testing State Machine Transitions
```javascript
it('should validate state transitions', async () => {
  const call = makeCall({ attendance: 'Show' });
  mockBQ._seedTable('Calls', [call]);

  // Valid transition
  const result1 = await callStateManager.transition(call.call_id, 'Closed - Won');
  expect(result1.success).toBe(true);

  // Invalid transition (Show → Scheduled is not allowed)
  const result2 = await callStateManager.transition(call.call_id, 'Scheduled');
  expect(result2.success).toBe(false);
  expect(result2.error).toMatch(/Invalid transition/);
});
```

### Testing Audit Logging
```javascript
it('should log state changes to audit log', async () => {
  mockBQ._reset();

  const call = makeCall({ attendance: null });
  mockBQ._seedTable('Calls', [call]);

  await callStateManager.transition(call.call_id, 'Waiting for Outcome');

  // Verify audit entry
  const audit = mockBQ._getAuditLog();
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    entity_type: 'call',
    entity_id: call.call_id,
    action: 'state_change',
    field_changed: 'attendance',
    old_value: null,
    new_value: 'Waiting for Outcome',
    trigger_source: 'timeout',
  });
});
```

### Testing Client Isolation
```javascript
it('should prevent client cross-contamination', async () => {
  // Seed calls for two different clients
  mockBQ._seedTable('Calls', [
    { call_id: 'call_1', client_id: 'client_a', ... },
    { call_id: 'call_2', client_id: 'client_b', ... },
  ]);

  // Query should be scoped
  const result = await BigQueryClient.runQuery(
    `SELECT * FROM Calls WHERE client_id = @clientId`,
    { clientId: 'client_a' }
  );

  expect(result).toHaveLength(1);
  expect(result[0].client_id).toBe('client_a');

  // Should never return client_b's data
  expect(result.some(r => r.client_id === 'client_b')).toBe(false);
});
```

## Running Tests

### All Tests
```bash
cd Backend
npm test
```

### Specific Test File
```bash
npm test tests/scenarios/ghosted-no-show.test.js
```

### Watch Mode (Rerun on Changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test Case
```bash
npm test -- --testNamePattern="should create call record"
```

## Debugging Tests

### Console Logging
```javascript
it('should process event', async () => {
  const event = { /* ... */ };
  console.log('Event:', event);  // Visible in test output

  const result = await service.process(event);
  console.log('Result:', result);
});

// Run with:
npm test -- --verbose
```

### Debugger
```javascript
it('should process event', async () => {
  debugger;  // Will pause if Node inspector is open
  const result = await service.process(event);
});

// Run with:
node --inspect-brk node_modules/.bin/jest tests/services/CallStateManager.test.js
```

## Test Checklist

Before committing, verify:

- [ ] All 48 scenario tests pass
- [ ] Service unit tests pass
- [ ] Route handler tests pass
- [ ] Integration tests pass
- [ ] Client isolation tested (cross-client queries blocked)
- [ ] Audit logging verified (state changes logged)
- [ ] Error cases covered (missing fields, invalid states, API failures)
- [ ] Async operations properly awaited
- [ ] Mock state reset between tests
- [ ] Edge cases covered (empty data, null values, duplicates)

---

*Testing guide: [analysis date]*
