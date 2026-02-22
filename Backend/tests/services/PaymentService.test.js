/**
 * PAYMENT SERVICE — Unit Tests
 *
 * Tests payment processing logic: matching to calls, state transitions,
 * refunds, chargebacks, and edge cases.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const paymentService = require('../../src/services/PaymentService');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

function seedClientAndCloser() {
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
}

function seedCallWithOutcome(outcome, overrides = {}) {
  seedClientAndCloser();
  mockBQ._seedTable('Calls', [{
    call_id: 'call_pay_001',
    appointment_id: 'event_pay_001',
    client_id: CLIENT_ID,
    closer_id: 'closer_sarah_001',
    prospect_email: 'john@example.com',
    prospect_name: 'John Smith',
    attendance: outcome === 'Show' ? 'Show' : outcome,
    call_outcome: outcome === 'Show' ? null : outcome,
    processing_status: 'complete',
    appointment_date: '2026-02-20T20:00:00.000Z',
    created: '2026-02-18T10:00:00.000Z',
    cash_collected: 0,
    revenue_generated: 0,
    ...overrides,
  }]);
}

beforeEach(() => {
  mockBQ._reset();
});

describe('PaymentService', () => {
  describe('processPayment — new close (Follow Up → Closed - Won)', () => {
    it('should transition Follow Up to Closed - Won', async () => {
      seedCallWithOutcome('Follow Up');

      const result = await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        payment_type: 'full',
      }, CLIENT_ID);

      expect(result.status).toBe('ok');
      expect(result.action).toBe('new_close');
      expect(result.previous_outcome).toBe('Follow Up');
      expect(result.new_outcome).toBe('Closed - Won');
      expect(result.call_id).toBe('call_pay_001');
    });

    it('should update call revenue fields', async () => {
      seedCallWithOutcome('Follow Up');

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        payment_type: 'full',
      }, CLIENT_ID);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].cash_collected).toBe(5000);
      expect(calls[0].revenue_generated).toBe(5000);
      expect(calls[0].payment_plan).toBe('Full');
    });
  });

  describe('processPayment — Lost → Closed - Won', () => {
    it('should transition Lost to Closed - Won when payment arrives', async () => {
      seedCallWithOutcome('Lost');

      const result = await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        payment_type: 'full',
      }, CLIENT_ID);

      expect(result.status).toBe('ok');
      expect(result.action).toBe('new_close');
      expect(result.previous_outcome).toBe('Lost');
    });
  });

  describe('processPayment — additional payment on existing close', () => {
    it('should add to cash_collected on already Closed - Won call', async () => {
      seedCallWithOutcome('Closed - Won', { cash_collected: 5000, revenue_generated: 5000 });

      const result = await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 2500,
        payment_type: 'payment_plan',
      }, CLIENT_ID);

      expect(result.status).toBe('ok');
      expect(result.action).toBe('additional_payment');
      expect(result.total_cash_collected).toBe(7500);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].cash_collected).toBe(7500);
    });
  });

  describe('processPayment — deposit', () => {
    it('should set payment_plan to Deposit', async () => {
      seedCallWithOutcome('Follow Up');

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 1000,
        payment_type: 'deposit',
      }, CLIENT_ID);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].payment_plan).toBe('Deposit');
      expect(calls[0].cash_collected).toBe(1000);
    });
  });

  describe('processPayment — refund', () => {
    it('should subtract refund from cash_collected', async () => {
      seedCallWithOutcome('Closed - Won', { cash_collected: 5000 });

      const result = await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 2000,
        payment_type: 'refund',
      }, CLIENT_ID);

      expect(result.status).toBe('ok');
      expect(result.action).toBe('refund');
      expect(result.refund_amount).toBe(2000);
      expect(result.remaining_cash).toBe(3000);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].cash_collected).toBe(3000);
    });

    it('should revert to Lost on full refund', async () => {
      seedCallWithOutcome('Closed - Won', { cash_collected: 5000 });

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        payment_type: 'refund',
      }, CLIENT_ID);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].cash_collected).toBe(0);
      expect(calls[0].call_outcome).toBe('Lost');
      expect(calls[0].lost_reason).toContain('Full refund');
    });
  });

  describe('processPayment — chargeback', () => {
    it('should process like a refund with Lost revert', async () => {
      seedCallWithOutcome('Closed - Won', { cash_collected: 5000 });

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

  describe('processPayment — no matching call', () => {
    it('should record payment on prospect only', async () => {
      seedClientAndCloser();
      // No calls seeded

      const result = await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        payment_type: 'full',
      }, CLIENT_ID);

      expect(result.status).toBe('ok');
      expect(result.action).toBe('payment_recorded');
      expect(result.note).toContain('No matching Show call');

      const prospects = mockBQ._getTable('Prospects');
      expect(prospects).toHaveLength(1);
      expect(prospects[0].total_cash_collected).toBe(5000);
    });
  });

  describe('processPayment — prospect creation', () => {
    it('should create prospect if not exists', async () => {
      seedCallWithOutcome('Follow Up');

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        prospect_name: 'John Smith',
        payment_amount: 5000,
      }, CLIENT_ID);

      const prospects = mockBQ._getTable('Prospects');
      expect(prospects).toHaveLength(1);
      expect(prospects[0].prospect_email).toBe('john@example.com');
      expect(prospects[0].prospect_name).toBe('John Smith');
    });

    it('should reuse existing prospect', async () => {
      seedCallWithOutcome('Follow Up');
      mockBQ._seedTable('Prospects', [{
        prospect_id: 'existing_p',
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        prospect_name: 'John Smith',
        total_cash_collected: 1000,
        payment_count: 1,
      }]);

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 4000,
      }, CLIENT_ID);

      const prospects = mockBQ._getTable('Prospects');
      expect(prospects).toHaveLength(1);
      expect(prospects[0].total_cash_collected).toBe(5000);
      expect(prospects[0].payment_count).toBe(2);
    });
  });

  describe('processPayment — date_closed and product', () => {
    it('should set date_closed from payment_date', async () => {
      seedCallWithOutcome('Follow Up');

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        payment_date: '2026-02-25',
      }, CLIENT_ID);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].date_closed).toBe('2026-02-25');
    });

    it('should set product_purchased from product_name', async () => {
      seedCallWithOutcome('Follow Up');

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
        product_name: 'Elite Coaching Program',
      }, CLIENT_ID);

      const calls = mockBQ._getTable('Calls');
      expect(calls[0].product_purchased).toBe('Elite Coaching Program');
    });
  });

  describe('processPayment — audit logging', () => {
    it('should write audit entries for payment close', async () => {
      seedCallWithOutcome('Follow Up');

      await paymentService.processPayment({
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        payment_amount: 5000,
      }, CLIENT_ID);

      const audit = mockBQ._getTable('AuditLog');
      const paymentAudit = audit.find(a => a.action === 'payment_close');
      expect(paymentAudit).toBeDefined();
      expect(paymentAudit.entity_type).toBe('call');
      expect(paymentAudit.new_value).toBe('Closed - Won');
    });
  });
});
