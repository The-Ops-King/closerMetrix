/**
 * TIMEOUT SERVICE — Unit Tests (Two-Phase Sweep)
 *
 * Tests the two-phase ghost/no-show detection logic:
 *
 * PHASE 1: attendance null (or legacy 'Scheduled') + past end time
 *          -> transitions to 'Waiting for Outcome'
 *          -> trigger: 'appointment_time_passed'
 *
 * PHASE 2: attendance 'Waiting for Outcome' + past timeout cutoff
 *          -> transitions to 'Ghosted - No Show'
 *          -> trigger: 'transcript_timeout'
 *          -> also sets transcript_status to 'No Transcript'
 *
 * Test coverage:
 * - Phase 1: null attendance past end time -> Waiting for Outcome
 * - Phase 1: future calls left alone
 * - Phase 1: backward compat with legacy 'Scheduled' attendance
 * - Phase 2: Waiting for Outcome past timeout -> Ghosted - No Show
 * - Phase 2: Waiting for Outcome within timeout -> left alone
 * - Two-phase in single sweep (old enough null -> Waiting, already-waiting -> Ghosted)
 * - Show calls untouched by both phases
 * - Multiple stuck calls
 * - Audit logging (correct old_value per phase)
 * - Configurable timeout
 * - Per-client isolation (checkClient)
 * - Cross-client sweep (checkAllClients)
 * - transcript_status set to 'No Transcript' in Phase 2
 * - Start/stop timer
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const timeoutService = require('../../src/services/TimeoutService');
const mockBQ = require('../helpers/mockBigQuery');
const config = require('../../src/config');

const CLIENT_ID = 'friends_inc';

beforeEach(() => {
  mockBQ._reset();
  // Set timeout to 120 minutes for tests (production will vary)
  config.timeouts.transcriptTimeoutMinutes = 120;
});

/**
 * Seeds a call record in the mock Calls table.
 *
 * Default attendance is null (new-style: blank on dashboard).
 * Override with 'Scheduled' to test backward compat, or
 * 'Waiting for Outcome' to test Phase 2.
 *
 * @param {string} callId — Unique call ID
 * @param {string} appointmentDate — ISO timestamp for appointment_date
 * @param {Object} overrides — Any fields to override on the seeded record
 */
function seedScheduledCall(callId, appointmentDate, overrides = {}) {
  const calls = mockBQ._getTable('Calls');
  calls.push({
    call_id: callId,
    appointment_id: `event_${callId}`,
    client_id: CLIENT_ID,
    closer_id: 'closer_001',
    prospect_email: 'john@example.com',
    prospect_name: 'John Smith',
    attendance: null,
    call_outcome: null,
    processing_status: 'pending',
    transcript_status: 'Pending',
    appointment_date: appointmentDate,
    appointment_end_date: null,
    created: new Date().toISOString(),
    ...overrides,
  });
}

/**
 * Returns an ISO timestamp N hours in the past.
 */
function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Returns an ISO timestamp N hours in the future.
 */
function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describe('TimeoutService', () => {
  // ─────────────────────────────────────────────────────────────────────
  // PHASE 1: null/Scheduled -> Waiting for Outcome (end time passed)
  // ─────────────────────────────────────────────────────────────────────
  describe('Phase 1 — null attendance past end time -> Waiting for Outcome', () => {
    it('should transition null attendance to Waiting for Outcome when end time has passed', async () => {
      // Call ended 30 minutes ago — past end time, Phase 1 should pick it up
      seedScheduledCall('call_past', hoursAgo(0.5));

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.checked).toBeGreaterThanOrEqual(1);
      expect(result.waiting).toBe(1);
      expect(result.call_ids).toContain('call_past');

      const calls = mockBQ._getTable('Calls');
      const updated = calls.find(c => c.call_id === 'call_past');
      expect(updated.attendance).toBe('Waiting for Outcome');
      // transcript_status should NOT change in Phase 1
      expect(updated.transcript_status).toBe('Pending');
    });

    it('should leave future calls alone (not yet past end time)', async () => {
      // Call is in the future — should not be touched
      seedScheduledCall('call_future', hoursFromNow(2));

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(0);
      expect(result.timed_out).toBe(0);

      const calls = mockBQ._getTable('Calls');
      const untouched = calls.find(c => c.call_id === 'call_future');
      expect(untouched.attendance).toBeNull();
    });

    it('should use appointment_end_date when available (COALESCE behavior)', async () => {
      // appointment_date is in the past, but appointment_end_date is in the future
      // COALESCE picks appointment_end_date, so the call should NOT be picked up
      seedScheduledCall('call_end_future', hoursAgo(1), {
        appointment_end_date: hoursFromNow(1),
      });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(0);

      const calls = mockBQ._getTable('Calls');
      const untouched = calls.find(c => c.call_id === 'call_end_future');
      expect(untouched.attendance).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PHASE 1: Backward compatibility with legacy 'Scheduled' attendance
  // ─────────────────────────────────────────────────────────────────────
  describe('Phase 1 — backward compat with legacy Scheduled attendance', () => {
    it('should also pick up legacy Scheduled attendance past end time', async () => {
      // Old-style record with attendance = 'Scheduled' (from before the null change)
      seedScheduledCall('call_legacy', hoursAgo(0.5), { attendance: 'Scheduled' });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(1);
      expect(result.call_ids).toContain('call_legacy');

      const calls = mockBQ._getTable('Calls');
      const updated = calls.find(c => c.call_id === 'call_legacy');
      expect(updated.attendance).toBe('Waiting for Outcome');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PHASE 2: Waiting for Outcome -> Ghosted - No Show (timeout elapsed)
  // ─────────────────────────────────────────────────────────────────────
  describe('Phase 2 — Waiting for Outcome past timeout -> Ghosted - No Show', () => {
    it('should transition Waiting for Outcome to Ghosted when past timeout', async () => {
      // Call ended 3 hours ago and is already Waiting for Outcome
      // With 120-minute timeout, cutoff = now - 2hrs, so 3hrs ago is past cutoff
      seedScheduledCall('call_ghost', hoursAgo(3), {
        attendance: 'Waiting for Outcome',
      });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.timed_out).toBe(1);
      expect(result.call_ids).toContain('call_ghost');

      const calls = mockBQ._getTable('Calls');
      const ghosted = calls.find(c => c.call_id === 'call_ghost');
      expect(ghosted.attendance).toBe('Ghosted - No Show');
    });

    it('should leave Waiting for Outcome calls alone when within timeout window', async () => {
      // Call ended 30 minutes ago and is Waiting for Outcome
      // With 120-minute timeout, cutoff = now - 2hrs, 30min ago is NOT past cutoff
      seedScheduledCall('call_waiting_recent', hoursAgo(0.5), {
        attendance: 'Waiting for Outcome',
      });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.timed_out).toBe(0);

      const calls = mockBQ._getTable('Calls');
      const stillWaiting = calls.find(c => c.call_id === 'call_waiting_recent');
      expect(stillWaiting.attendance).toBe('Waiting for Outcome');
    });

    it('should set transcript_status to No Transcript in Phase 2', async () => {
      seedScheduledCall('call_no_transcript', hoursAgo(3), {
        attendance: 'Waiting for Outcome',
        transcript_status: 'Pending',
      });

      await timeoutService.checkClient(CLIENT_ID);

      const calls = mockBQ._getTable('Calls');
      const ghosted = calls.find(c => c.call_id === 'call_no_transcript');
      expect(ghosted.attendance).toBe('Ghosted - No Show');
      expect(ghosted.transcript_status).toBe('No Transcript');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // TWO-PHASE IN SINGLE SWEEP
  // ─────────────────────────────────────────────────────────────────────
  describe('Two-phase in single sweep', () => {
    it('should process both phases: null -> Waiting AND already-Waiting -> Ghosted', async () => {
      // Call A: null attendance, ended 30 minutes ago -> Phase 1 picks it up
      seedScheduledCall('call_phase1', hoursAgo(0.5));

      // Call B: already Waiting for Outcome, ended 3 hours ago -> Phase 2 picks it up
      seedScheduledCall('call_phase2', hoursAgo(3), {
        attendance: 'Waiting for Outcome',
      });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(1);
      expect(result.timed_out).toBe(1);
      expect(result.checked).toBe(2);
      expect(result.call_ids).toContain('call_phase1');
      expect(result.call_ids).toContain('call_phase2');

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_phase1').attendance).toBe('Waiting for Outcome');
      expect(calls.find(c => c.call_id === 'call_phase2').attendance).toBe('Ghosted - No Show');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // SHOW CALLS UNTOUCHED
  // ─────────────────────────────────────────────────────────────────────
  describe('Show calls untouched', () => {
    it('should not touch calls already in Show state', async () => {
      seedScheduledCall('call_show', hoursAgo(3), { attendance: 'Show' });

      const result = await timeoutService.checkClient(CLIENT_ID);

      // Show has attendance = 'Show', which is neither null/Scheduled nor Waiting for Outcome
      // So neither Phase 1 nor Phase 2 query should return it
      expect(result.waiting).toBe(0);
      expect(result.timed_out).toBe(0);

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_show').attendance).toBe('Show');
    });

    it('should not touch calls in terminal states (Canceled, Ghosted, Closed - Won)', async () => {
      seedScheduledCall('call_canceled', hoursAgo(3), { attendance: 'Canceled' });
      seedScheduledCall('call_ghosted', hoursAgo(3), { attendance: 'Ghosted - No Show' });
      seedScheduledCall('call_closed', hoursAgo(3), { attendance: 'Closed - Won' });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(0);
      expect(result.timed_out).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // MULTIPLE STUCK CALLS
  // ─────────────────────────────────────────────────────────────────────
  describe('Multiple stuck calls', () => {
    it('should transition multiple null-attendance calls in Phase 1', async () => {
      seedScheduledCall('call_old_1', hoursAgo(0.5));
      seedScheduledCall('call_old_2', hoursAgo(1));
      seedScheduledCall('call_old_3', hoursAgo(1.5));

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(3);
      expect(result.call_ids).toHaveLength(3);

      const calls = mockBQ._getTable('Calls');
      for (const call of calls) {
        expect(call.attendance).toBe('Waiting for Outcome');
      }
    });

    it('should transition multiple Waiting calls in Phase 2', async () => {
      seedScheduledCall('call_wait_1', hoursAgo(4), { attendance: 'Waiting for Outcome' });
      seedScheduledCall('call_wait_2', hoursAgo(5), { attendance: 'Waiting for Outcome' });
      seedScheduledCall('call_wait_3', hoursAgo(3), { attendance: 'Waiting for Outcome' });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.timed_out).toBe(3);
      expect(result.call_ids).toHaveLength(3);

      const calls = mockBQ._getTable('Calls');
      for (const call of calls) {
        expect(call.attendance).toBe('Ghosted - No Show');
        expect(call.transcript_status).toBe('No Transcript');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // AUDIT LOGGING
  // ─────────────────────────────────────────────────────────────────────
  describe('Audit logging', () => {
    it('should write audit log with old_value=null for Phase 1 transitions', async () => {
      seedScheduledCall('call_audit_p1', hoursAgo(0.5));

      await timeoutService.checkClient(CLIENT_ID);

      const audit = mockBQ._getTable('AuditLog');
      const stateChange = audit.find(
        a => a.action === 'state_change' && a.entity_id === 'call_audit_p1'
      );
      expect(stateChange).toBeDefined();
      expect(stateChange.old_value).toBeNull();
      expect(stateChange.new_value).toBe('Waiting for Outcome');
      expect(stateChange.trigger_source).toBe('appointment_time_passed');
      expect(stateChange.field_changed).toBe('attendance');
    });

    it('should write audit log with old_value=Waiting for Outcome for Phase 2 transitions', async () => {
      seedScheduledCall('call_audit_p2', hoursAgo(3), {
        attendance: 'Waiting for Outcome',
      });

      await timeoutService.checkClient(CLIENT_ID);

      const audit = mockBQ._getTable('AuditLog');
      const stateChange = audit.find(
        a => a.action === 'state_change' && a.entity_id === 'call_audit_p2'
      );
      expect(stateChange).toBeDefined();
      expect(stateChange.old_value).toBe('Waiting for Outcome');
      expect(stateChange.new_value).toBe('Ghosted - No Show');
      expect(stateChange.trigger_source).toBe('transcript_timeout');
      expect(stateChange.field_changed).toBe('attendance');
    });

    it('should write audit log with old_value=Scheduled for legacy Phase 1 transitions', async () => {
      seedScheduledCall('call_audit_legacy', hoursAgo(0.5), { attendance: 'Scheduled' });

      await timeoutService.checkClient(CLIENT_ID);

      const audit = mockBQ._getTable('AuditLog');
      const stateChange = audit.find(
        a => a.action === 'state_change' && a.entity_id === 'call_audit_legacy'
      );
      expect(stateChange).toBeDefined();
      expect(stateChange.old_value).toBe('Scheduled');
      expect(stateChange.new_value).toBe('Waiting for Outcome');
      expect(stateChange.trigger_source).toBe('appointment_time_passed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // CONFIGURABLE TIMEOUT
  // ─────────────────────────────────────────────────────────────────────
  describe('Configurable timeout', () => {
    it('should respect configurable timeout minutes for Phase 2', async () => {
      // Call ended 90 minutes ago and is Waiting for Outcome
      seedScheduledCall('call_edge', hoursAgo(1.5), {
        attendance: 'Waiting for Outcome',
      });

      // Default 120 min timeout — cutoff = now - 2hrs
      // 90 minutes ago is NOT past the 2hr cutoff, so should NOT timeout
      let result = await timeoutService.checkClient(CLIENT_ID);
      expect(result.timed_out).toBe(0);

      // Change to 60 min timeout — cutoff = now - 1hr
      // 90 minutes ago IS past the 1hr cutoff, so should timeout now
      config.timeouts.transcriptTimeoutMinutes = 60;
      result = await timeoutService.checkClient(CLIENT_ID);
      expect(result.timed_out).toBe(1);
    });

    it('should not affect Phase 1 (Phase 1 uses now, not timeout cutoff)', async () => {
      // Call ended 10 minutes ago, attendance = null
      // Phase 1 triggers as soon as end time passes (no timeout offset)
      seedScheduledCall('call_just_ended', hoursAgo(10 / 60));

      // Even with a very long timeout, Phase 1 should still pick it up
      config.timeouts.transcriptTimeoutMinutes = 600;

      const result = await timeoutService.checkClient(CLIENT_ID);
      expect(result.waiting).toBe(1);

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_just_ended').attendance).toBe('Waiting for Outcome');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PER-CLIENT ISOLATION (checkClient)
  // ─────────────────────────────────────────────────────────────────────
  describe('Per-client isolation — checkClient', () => {
    it('should only process calls for the specified client in Phase 1', async () => {
      seedScheduledCall('call_correct', hoursAgo(0.5), { client_id: CLIENT_ID });
      seedScheduledCall('call_other', hoursAgo(0.5), { client_id: 'other_client' });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.waiting).toBe(1);
      expect(result.call_ids).toContain('call_correct');
      expect(result.call_ids).not.toContain('call_other');

      // Other client's call should be untouched
      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_other').attendance).toBeNull();
    });

    it('should only process calls for the specified client in Phase 2', async () => {
      seedScheduledCall('call_correct_p2', hoursAgo(3), {
        client_id: CLIENT_ID,
        attendance: 'Waiting for Outcome',
      });
      seedScheduledCall('call_other_p2', hoursAgo(3), {
        client_id: 'other_client',
        attendance: 'Waiting for Outcome',
      });

      const result = await timeoutService.checkClient(CLIENT_ID);

      expect(result.timed_out).toBe(1);
      expect(result.call_ids).toContain('call_correct_p2');
      expect(result.call_ids).not.toContain('call_other_p2');

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_other_p2').attendance).toBe('Waiting for Outcome');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // CROSS-CLIENT SWEEP (checkAllClients)
  // ─────────────────────────────────────────────────────────────────────
  describe('checkAllClients — cross-client sweep', () => {
    it('should run Phase 1 across all clients', async () => {
      seedScheduledCall('call_a', hoursAgo(0.5), { client_id: 'client_a' });
      seedScheduledCall('call_b', hoursAgo(1), { client_id: 'client_b' });

      const result = await timeoutService.checkAllClients();

      expect(result.total_waiting).toBe(2);
      expect(result.errors).toBe(0);

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_a').attendance).toBe('Waiting for Outcome');
      expect(calls.find(c => c.call_id === 'call_b').attendance).toBe('Waiting for Outcome');
    });

    it('should run Phase 2 across all clients', async () => {
      seedScheduledCall('call_c', hoursAgo(3), { client_id: 'client_c', attendance: 'Waiting for Outcome' });
      seedScheduledCall('call_d', hoursAgo(4), { client_id: 'client_d', attendance: 'Waiting for Outcome' });

      const result = await timeoutService.checkAllClients();

      expect(result.total_timed_out).toBe(2);
      expect(result.errors).toBe(0);

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_c').attendance).toBe('Ghosted - No Show');
      expect(calls.find(c => c.call_id === 'call_d').attendance).toBe('Ghosted - No Show');
    });

    it('should run both phases in a single sweep across all clients', async () => {
      // Phase 1 candidate: null attendance, ended 30 min ago
      seedScheduledCall('call_p1_global', hoursAgo(0.5), { client_id: 'client_x' });
      // Phase 2 candidate: Waiting for Outcome, ended 3 hours ago
      seedScheduledCall('call_p2_global', hoursAgo(3), {
        client_id: 'client_y',
        attendance: 'Waiting for Outcome',
      });

      const result = await timeoutService.checkAllClients();

      expect(result.total_checked).toBe(2);
      expect(result.total_waiting).toBe(1);
      expect(result.total_timed_out).toBe(1);
      expect(result.errors).toBe(0);

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_p1_global').attendance).toBe('Waiting for Outcome');
      expect(calls.find(c => c.call_id === 'call_p2_global').attendance).toBe('Ghosted - No Show');
    });

    it('should handle zero stuck calls gracefully', async () => {
      const result = await timeoutService.checkAllClients();

      expect(result.total_checked).toBe(0);
      expect(result.total_waiting).toBe(0);
      expect(result.total_timed_out).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should set transcript_status to No Transcript in Phase 2 (cross-client)', async () => {
      seedScheduledCall('call_transcript', hoursAgo(3), {
        attendance: 'Waiting for Outcome',
        transcript_status: 'Pending',
      });

      await timeoutService.checkAllClients();

      const calls = mockBQ._getTable('Calls');
      const ghosted = calls.find(c => c.call_id === 'call_transcript');
      expect(ghosted.attendance).toBe('Ghosted - No Show');
      expect(ghosted.transcript_status).toBe('No Transcript');
    });

    it('should not touch calls within the timeout window (Phase 2) or future (Phase 1)', async () => {
      // Phase 1: future call -> not picked up
      seedScheduledCall('call_future_global', hoursFromNow(1));
      // Phase 2: Waiting but within timeout -> not picked up
      seedScheduledCall('call_recent_waiting', hoursAgo(0.5), {
        attendance: 'Waiting for Outcome',
      });
      // Phase 2: Waiting and past timeout -> picked up
      seedScheduledCall('call_old_waiting', hoursAgo(3), {
        attendance: 'Waiting for Outcome',
      });

      const result = await timeoutService.checkAllClients();

      expect(result.total_waiting).toBe(0);
      expect(result.total_timed_out).toBe(1);

      const calls = mockBQ._getTable('Calls');
      expect(calls.find(c => c.call_id === 'call_future_global').attendance).toBeNull();
      expect(calls.find(c => c.call_id === 'call_recent_waiting').attendance).toBe('Waiting for Outcome');
      expect(calls.find(c => c.call_id === 'call_old_waiting').attendance).toBe('Ghosted - No Show');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // START / STOP TIMER
  // ─────────────────────────────────────────────────────────────────────
  describe('start / stop', () => {
    afterEach(() => {
      // Always clean up timers to avoid test leaks
      timeoutService.stop();
    });

    it('should start and stop cleanly without errors', () => {
      timeoutService.start();
      timeoutService.stop();
    });

    it('should be safe to call stop multiple times', () => {
      timeoutService.start();
      timeoutService.stop();
      timeoutService.stop(); // Should not throw
    });

    it('should be safe to call stop without start', () => {
      timeoutService.stop(); // Should not throw
    });
  });
});
