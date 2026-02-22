/**
 * PAYMENT SCENARIOS (16-17, 31-35)
 *
 * Tests payment edge cases through the full pipeline.
 * Uses mockBigQuery for in-memory state.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const paymentService = require('../../src/services/PaymentService');
const callStateManager = require('../../src/services/CallStateManager');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

function seedBaseData(callOverrides = {}) {
  mockBQ._seedTable('Clients', [{
    client_id: CLIENT_ID,
    company_name: 'Friends Inc',
    webhook_secret: 'secret_123',
    status: 'active',
  }]);
  mockBQ._seedTable('Closers', [{
    closer_id: 'closer_sarah_001',
    client_id: CLIENT_ID,
    name: 'Sarah Closer',
    work_email: 'sarah@acmecoaching.com',
    status: 'active',
  }]);
  mockBQ._seedTable('Calls', [{
    call_id: 'call_scenario',
    appointment_id: 'event_scenario',
    client_id: CLIENT_ID,
    closer_id: 'closer_sarah_001',
    prospect_email: 'john@example.com',
    prospect_name: 'John Smith',
    attendance: 'Follow Up',
    call_outcome: 'Follow Up',
    processing_status: 'complete',
    appointment_date: '2026-02-20T20:00:00.000Z',
    created: '2026-02-18T10:00:00.000Z',
    cash_collected: 0,
    revenue_generated: 0,
    date_closed: null,
    payment_plan: null,
    product_purchased: null,
    lost_reason: null,
    ...callOverrides,
  }]);
}

beforeEach(() => {
  mockBQ._reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 16: Close then refund
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 16: Close then refund', () => {
  it('should close, then reduce cash on refund', async () => {
    seedBaseData();

    // Step 1: Payment arrives → Follow Up → Closed - Won
    const closeResult = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
      payment_type: 'full',
    }, CLIENT_ID);

    expect(closeResult.action).toBe('new_close');

    const callsAfterClose = mockBQ._getTable('Calls');
    expect(callsAfterClose[0].cash_collected).toBe(5000);
    expect(callsAfterClose[0].call_outcome).toBe('Closed - Won');

    // Step 2: Full refund arrives
    const refundResult = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
      payment_type: 'refund',
    }, CLIENT_ID);

    expect(refundResult.action).toBe('refund');
    expect(refundResult.remaining_cash).toBe(0);

    const callsAfterRefund = mockBQ._getTable('Calls');
    expect(callsAfterRefund[0].cash_collected).toBe(0);
    expect(callsAfterRefund[0].call_outcome).toBe('Lost');
    expect(callsAfterRefund[0].lost_reason).toContain('Full refund');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 17: Prospect says no, then changes mind
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 17: Prospect says no, then changes mind', () => {
  it('should transition Lost → Closed - Won when payment arrives', async () => {
    seedBaseData({ attendance: 'Lost', call_outcome: 'Lost' });

    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
      payment_type: 'full',
    }, CLIENT_ID);

    expect(result.action).toBe('new_close');
    expect(result.previous_outcome).toBe('Lost');
    expect(result.new_outcome).toBe('Closed - Won');

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].cash_collected).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 31: date_closed doesn't match call date
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 31: date_closed from payment, not call', () => {
  it('should set date_closed from payment_date, not appointment_date', async () => {
    seedBaseData();

    await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
      payment_date: '2026-02-25', // Payment 5 days after call on Feb 20
    }, CLIENT_ID);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].date_closed).toBe('2026-02-25');
    expect(calls[0].appointment_date).toBe('2026-02-20T20:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 32: Payment plan — revenue vs cash diverge
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 32: Payment plan — revenue vs cash diverge', () => {
  it('should track deposit separately from full revenue', async () => {
    seedBaseData();

    // Deposit of $1000 on a $5000 deal
    await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 1000,
      payment_type: 'deposit',
    }, CLIENT_ID);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].cash_collected).toBe(1000);
    expect(calls[0].revenue_generated).toBe(1000);
    expect(calls[0].payment_plan).toBe('Deposit');

    // Second payment of $4000
    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 4000,
      payment_type: 'payment_plan',
    }, CLIENT_ID);

    expect(result.action).toBe('additional_payment');

    const callsAfter = mockBQ._getTable('Calls');
    expect(callsAfter[0].cash_collected).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 33: Partial refund
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 33: Partial refund', () => {
  it('should reduce cash but keep Closed - Won outcome', async () => {
    seedBaseData({
      attendance: 'Closed - Won',
      call_outcome: 'Closed - Won',
      cash_collected: 5000,
      revenue_generated: 5000,
    });

    // Seed prospect too
    mockBQ._seedTable('Prospects', [{
      prospect_id: 'prospect_001',
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      total_cash_collected: 5000,
      payment_count: 1,
      deal_status: 'closed_won',
    }]);

    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 1500,
      payment_type: 'refund',
    }, CLIENT_ID);

    expect(result.action).toBe('refund');
    expect(result.remaining_cash).toBe(3500);

    const calls = mockBQ._getTable('Calls');
    // Outcome stays Closed - Won because there's still cash
    expect(calls[0].call_outcome).toBe('Closed - Won');
    expect(calls[0].cash_collected).toBe(3500);

    const prospects = mockBQ._getTable('Prospects');
    expect(prospects[0].total_cash_collected).toBe(3500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 34: Chargeback
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 34: Chargeback', () => {
  it('should process like a refund and revert outcome', async () => {
    seedBaseData({
      attendance: 'Closed - Won',
      call_outcome: 'Closed - Won',
      cash_collected: 5000,
    });

    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
      payment_type: 'chargeback',
    }, CLIENT_ID);

    expect(result.action).toBe('refund');
    expect(result.remaining_cash).toBe(0);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].call_outcome).toBe('Lost');
    expect(calls[0].lost_reason).toContain('Chargeback');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 35: Close then upgrade
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 35: Close then upgrade (additional payment)', () => {
  it('should increase cash_collected on additional payment', async () => {
    seedBaseData({
      attendance: 'Closed - Won',
      call_outcome: 'Closed - Won',
      cash_collected: 5000,
      revenue_generated: 5000,
      product_purchased: 'Basic Coaching',
    });

    mockBQ._seedTable('Prospects', [{
      prospect_id: 'prospect_001',
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      total_cash_collected: 5000,
      payment_count: 1,
      deal_status: 'closed_won',
    }]);

    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 3000,
      payment_type: 'full',
      product_name: 'Elite Coaching Upgrade',
    }, CLIENT_ID);

    expect(result.action).toBe('additional_payment');
    expect(result.total_cash_collected).toBe(8000);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].cash_collected).toBe(8000);
    expect(calls[0].product_purchased).toBe('Elite Coaching Upgrade');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deposit → Full Payment → Closed - Won (state machine Deposit transition)
// ─────────────────────────────────────────────────────────────────────────────
describe('Deposit state → Full Payment → Closed - Won', () => {
  it('should transition Deposit → Closed - Won via payment_received_full trigger', async () => {
    // Simulate: AI set outcome to Deposit (partial payment on the call)
    seedBaseData({
      attendance: 'Deposit',
      call_outcome: 'Deposit',
      cash_collected: 2000,
      revenue_generated: 2000,
      payment_plan: 'Deposit',
    });

    // Full remaining payment comes in later
    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 8000,
      payment_type: 'full',
      product_name: 'Executive Coaching',
    }, CLIENT_ID);

    expect(result.action).toBe('new_close');
    expect(result.new_outcome).toBe('Closed - Won');

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].attendance).toBe('Closed - Won');
    expect(calls[0].call_outcome).toBe('Closed - Won');
    expect(calls[0].cash_collected).toBe(10000);
    expect(calls[0].product_purchased).toBe('Executive Coaching');
  });

  it('should handle deposit then multiple payment plan installments', async () => {
    seedBaseData({
      attendance: 'Deposit',
      call_outcome: 'Deposit',
      cash_collected: 1000,
      revenue_generated: 1000,
      payment_plan: 'Deposit',
    });

    // First installment → transitions Deposit → Closed - Won
    const firstResult = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 3000,
      payment_type: 'payment_plan',
    }, CLIENT_ID);

    expect(firstResult.action).toBe('new_close');

    const callsAfterFirst = mockBQ._getTable('Calls');
    expect(callsAfterFirst[0].attendance).toBe('Closed - Won');
    expect(callsAfterFirst[0].cash_collected).toBe(4000);

    // Second installment → additional payment on already Closed - Won
    const secondResult = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 3000,
      payment_type: 'payment_plan',
    }, CLIENT_ID);

    expect(secondResult.action).toBe('additional_payment');
    expect(secondResult.total_cash_collected).toBe(7000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('Payment — additional edge cases', () => {
  it('should handle Not Pitched → Closed - Won via payment', async () => {
    seedBaseData({ attendance: 'Not Pitched', call_outcome: 'Not Pitched' });

    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
    }, CLIENT_ID);

    expect(result.action).toBe('new_close');
  });

  it('should default payment_type to full when not specified', async () => {
    seedBaseData();

    await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      payment_amount: 5000,
    }, CLIENT_ID);

    const calls = mockBQ._getTable('Calls');
    expect(calls[0].payment_plan).toBe('Full');
  });

  it('should handle payment for prospect with no call record', async () => {
    seedBaseData();
    mockBQ._seedTable('Calls', []); // Remove calls

    const result = await paymentService.processPayment({
      client_id: CLIENT_ID,
      prospect_email: 'new_prospect@example.com',
      prospect_name: 'New Prospect',
      payment_amount: 5000,
    }, CLIENT_ID);

    expect(result.status).toBe('ok');
    expect(result.action).toBe('payment_recorded');

    // Prospect should still be created
    const prospects = mockBQ._getTable('Prospects');
    expect(prospects).toHaveLength(1);
    expect(prospects[0].prospect_email).toBe('new_prospect@example.com');
    expect(prospects[0].total_cash_collected).toBe(5000);
  });
});
