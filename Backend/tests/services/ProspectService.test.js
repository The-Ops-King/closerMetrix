/**
 * PROSPECT SERVICE — Unit Tests
 *
 * Tests prospect find-or-create, payment updates, and name updates.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const prospectService = require('../../src/services/ProspectService');
const mockBQ = require('../helpers/mockBigQuery');

const CLIENT_ID = 'friends_inc';

beforeEach(() => {
  mockBQ._reset();
});

describe('ProspectService', () => {
  describe('findOrCreate', () => {
    it('should create a new prospect when none exists', async () => {
      const { prospect, created } = await prospectService.findOrCreate(
        'john@example.com', CLIENT_ID, { prospect_name: 'John Smith' }
      );

      expect(created).toBe(true);
      expect(prospect.prospect_email).toBe('john@example.com');
      expect(prospect.client_id).toBe(CLIENT_ID);
      expect(prospect.prospect_name).toBe('John Smith');
      expect(prospect.status).toBe('active');
      expect(prospect.deal_status).toBe('open');
      expect(prospect.total_cash_collected).toBe(0);
      expect(prospect.payment_count).toBe(0);

      const stored = mockBQ._getTable('Prospects');
      expect(stored).toHaveLength(1);
    });

    it('should return existing prospect when found', async () => {
      mockBQ._seedTable('Prospects', [{
        prospect_id: 'prospect_001',
        client_id: CLIENT_ID,
        prospect_email: 'john@example.com',
        prospect_name: 'John Smith',
        total_cash_collected: 5000,
        payment_count: 1,
      }]);

      const { prospect, created } = await prospectService.findOrCreate(
        'john@example.com', CLIENT_ID
      );

      expect(created).toBe(false);
      expect(prospect.prospect_id).toBe('prospect_001');
      expect(prospect.total_cash_collected).toBe(5000);
    });

    it('should write audit log on create', async () => {
      await prospectService.findOrCreate('new@example.com', CLIENT_ID);

      const audit = mockBQ._getTable('AuditLog');
      const prospectAudit = audit.find(a => a.entity_type === 'prospect' && a.action === 'created');
      expect(prospectAudit).toBeDefined();
      expect(prospectAudit.new_value).toBe('new@example.com');
    });
  });

  describe('updateWithPayment', () => {
    const MOCK_PROSPECT = {
      prospect_id: 'prospect_001',
      client_id: CLIENT_ID,
      prospect_email: 'john@example.com',
      total_cash_collected: 0,
      payment_count: 0,
      deal_status: 'open',
    };

    it('should add payment amount to total_cash_collected', async () => {
      mockBQ._seedTable('Prospects', [{ ...MOCK_PROSPECT }]);

      const updated = await prospectService.updateWithPayment(
        MOCK_PROSPECT, { amount: 5000, paymentType: 'full', paymentDate: '2026-02-15' }, CLIENT_ID
      );

      expect(updated.total_cash_collected).toBe(5000);
      expect(updated.payment_count).toBe(1);
      expect(updated.deal_status).toBe('closed_won');
    });

    it('should accumulate multiple payments', async () => {
      const prospect = { ...MOCK_PROSPECT, total_cash_collected: 2000, payment_count: 1 };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateWithPayment(
        prospect, { amount: 3000, paymentType: 'payment_plan' }, CLIENT_ID
      );

      expect(updated.total_cash_collected).toBe(5000);
      expect(updated.payment_count).toBe(2);
    });

    it('should subtract refund from total_cash_collected', async () => {
      const prospect = { ...MOCK_PROSPECT, total_cash_collected: 5000, payment_count: 1, deal_status: 'closed_won' };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateWithPayment(
        prospect, { amount: 2000, paymentType: 'refund' }, CLIENT_ID
      );

      expect(updated.total_cash_collected).toBe(3000);
      // deal_status stays closed_won because there's still cash
      expect(updated.deal_status).toBe('closed_won');
    });

    it('should revert deal_status to lost on full refund', async () => {
      const prospect = { ...MOCK_PROSPECT, total_cash_collected: 5000, payment_count: 1, deal_status: 'closed_won' };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateWithPayment(
        prospect, { amount: 5000, paymentType: 'refund' }, CLIENT_ID
      );

      expect(updated.total_cash_collected).toBe(0);
      expect(updated.deal_status).toBe('lost');
    });

    it('should not go below 0 on over-refund', async () => {
      const prospect = { ...MOCK_PROSPECT, total_cash_collected: 1000 };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateWithPayment(
        prospect, { amount: 5000, paymentType: 'refund' }, CLIENT_ID
      );

      expect(updated.total_cash_collected).toBe(0);
    });

    it('should set product_purchased', async () => {
      mockBQ._seedTable('Prospects', [{ ...MOCK_PROSPECT }]);

      const updated = await prospectService.updateWithPayment(
        MOCK_PROSPECT,
        { amount: 5000, paymentType: 'full', productName: 'Elite Coaching' },
        CLIENT_ID
      );

      expect(updated.product_purchased).toBe('Elite Coaching');
    });

    it('should handle chargeback like refund', async () => {
      const prospect = { ...MOCK_PROSPECT, total_cash_collected: 5000, deal_status: 'closed_won' };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateWithPayment(
        prospect, { amount: 5000, paymentType: 'chargeback' }, CLIENT_ID
      );

      expect(updated.total_cash_collected).toBe(0);
      expect(updated.deal_status).toBe('lost');
    });
  });

  describe('updateName', () => {
    it('should update name when not already set', async () => {
      const prospect = { prospect_id: 'p1', client_id: CLIENT_ID, prospect_name: null };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateName(prospect, 'John Smith', CLIENT_ID);
      expect(updated.prospect_name).toBe('John Smith');
    });

    it('should not overwrite existing name', async () => {
      const prospect = { prospect_id: 'p1', client_id: CLIENT_ID, prospect_name: 'Existing Name' };
      mockBQ._seedTable('Prospects', [prospect]);

      const updated = await prospectService.updateName(prospect, 'New Name', CLIENT_ID);
      expect(updated.prospect_name).toBe('Existing Name');
    });
  });
});
