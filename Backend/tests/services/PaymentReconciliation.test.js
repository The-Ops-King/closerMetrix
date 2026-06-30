/**
 * PAYMENT RECONCILIATION — Unit Tests
 *
 * Covers the race-condition fix: payments that fire BEFORE a call's matchable
 * 'Show' record exists log 'payment_no_match'; reconciliation replays them once
 * the call exists. Also covers email-match normalization (case/whitespace).
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const paymentService = require('../../src/services/PaymentService');
const matchingService = require('../../src/services/MatchingService');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'reco_inc';

function seedClient() {
  mockBQ._seedTable('Clients', [{
    client_id: CLIENT_ID, company_name: 'Reco Inc', status: 'active',
  }]);
}

function seedCall(overrides = {}) {
  mockBQ._seedTable('Calls', [{
    call_id: 'call_reco_001',
    client_id: CLIENT_ID,
    closer_id: 'closer_001',
    prospect_email: 'jane@example.com',
    prospect_name: 'Jane Doe',
    // Post-AI state: the transcript created the call, AI marked it 'Follow Up'.
    // This is the real reconcile scenario (payment arrived before this existed).
    attendance: 'Follow Up',
    call_outcome: 'Follow Up',
    processing_status: 'complete',
    appointment_date: '2026-06-30T20:00:00.000Z',
    cash_collected: 0,
    revenue_generated: 0,
    ...overrides,
  }]);
}

function seedProspect(overrides = {}) {
  mockBQ._seedTable('Prospects', [{
    prospect_id: 'prospect_jane',
    client_id: CLIENT_ID,
    prospect_email: 'jane@example.com',
    prospect_name: 'Jane Doe',
    deal_status: 'open',
    total_cash_collected: 7000, // already advanced at no-match time
    payment_count: 1,
    total_revenue_generated: 0,
    ...overrides,
  }]);
}

function seedNoMatchAudit(payload = {}, amount = 7000) {
  mockBQ._seedTable('AuditLog', [{
    audit_id: 'audit_nomatch_001',
    timestamp: '2026-06-30T19:14:01.000Z',
    client_id: CLIENT_ID,
    entity_type: 'prospect',
    entity_id: 'prospect_jane',
    action: 'payment_no_match',
    trigger_source: 'payment_webhook',
    metadata: JSON.stringify({
      amount,
      reason: 'No call matched',
      original_payload: {
        client_id: CLIENT_ID,
        prospect_email: 'jane@example.com',
        prospect_name: 'Jane Doe',
        payment_amount: amount,
        payment_date: '2026-06-30',
        product_name: 'TLL Base',
        payment_type: 'full',
        ...payload,
      },
    }),
  }]);
}

beforeEach(() => {
  mockBQ._reset();
});

describe('MatchingService email normalization', () => {
  it('matches a payment to a call when the call email differs in case/whitespace', async () => {
    seedClient();
    seedCall({ prospect_email: 'Jane@Example.COM ' }); // stored messy

    const match = await matchingService.findMatchingCall(CLIENT_ID, 'jane@example.com', 'Jane Doe');

    expect(match).not.toBeNull();
    expect(match.call.call_id).toBe('call_reco_001');
    expect(match.matchTier).toBe('email');
  });
});

describe('PaymentService.reconcileProspectPayments', () => {
  it('replays an unmatched payment onto a now-existing call → Closed - Won', async () => {
    seedClient();
    seedCall();        // un-won Show call now exists
    seedProspect();
    seedNoMatchAudit();

    const res = await paymentService.reconcileProspectPayments(CLIENT_ID, 'jane@example.com', 'Jane Doe');

    expect(res.reconciled).toBe(1);
    expect(res.alreadyClosed).toBe(0);

    const call = mockBQ._getTable('Calls').find(c => c.call_id === 'call_reco_001');
    expect(call.call_outcome).toBe('Closed - Won');
    expect(call.cash_collected).toBe(7000);
    expect(call.revenue_generated).toBe(7000);
  });

  it('is idempotent — a second run makes no further changes', async () => {
    seedClient();
    seedCall();
    seedProspect();
    seedNoMatchAudit();

    await paymentService.reconcileProspectPayments(CLIENT_ID, 'jane@example.com', 'Jane Doe');
    const res2 = await paymentService.reconcileProspectPayments(CLIENT_ID, 'jane@example.com', 'Jane Doe');

    expect(res2.reconciled).toBe(0);
    const call = mockBQ._getTable('Calls').find(c => c.call_id === 'call_reco_001');
    expect(call.cash_collected).toBe(7000); // NOT doubled
  });

  it('does NOT touch a call already Closed - Won (no double-count)', async () => {
    seedClient();
    seedCall({ call_outcome: 'Closed - Won', cash_collected: 3500, revenue_generated: 7000 });
    seedProspect();
    seedNoMatchAudit({}, 3500);

    const res = await paymentService.reconcileProspectPayments(CLIENT_ID, 'jane@example.com', 'Jane Doe');

    expect(res.alreadyClosed).toBe(1);
    expect(res.reconciled).toBe(0);
    const call = mockBQ._getTable('Calls').find(c => c.call_id === 'call_reco_001');
    expect(call.cash_collected).toBe(3500); // unchanged
  });

  it('leaves the payment unmatched when no call exists yet', async () => {
    seedClient();
    // no Calls seeded
    seedProspect();
    seedNoMatchAudit();

    const res = await paymentService.reconcileProspectPayments(CLIENT_ID, 'jane@example.com', 'Jane Doe');

    expect(res.reconciled).toBe(0);
    expect(res.stillUnmatched).toBe(1);
  });
});
