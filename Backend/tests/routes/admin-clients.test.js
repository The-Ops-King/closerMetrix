/**
 * CLIENT ADMIN ROUTES — Integration Tests
 *
 * Tests client CRUD operations via HTTP using supertest.
 * Covers: listing, get by ID, create, update, validation, auth.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const request = require('supertest');
const app = require('../../src/app');
const mockBQ = require('../helpers/mockBigQuery');
const config = require('../../src/config');

const ADMIN_KEY = 'test-admin-key-123';
const AUTH_HEADER = `Bearer ${ADMIN_KEY}`;

beforeAll(() => {
  config.admin.apiKey = ADMIN_KEY;
});

beforeEach(() => {
  mockBQ._reset();
});

const VALID_CLIENT_BODY = {
  company_name: 'Acme Coaching',
  primary_contact_email: 'john@acmecoaching.com',
  offer_name: 'Executive Coaching',
  offer_price: 10000,
  filter_word: 'strategy,discovery',
  plan_tier: 'insight',
  timezone: 'America/New_York',
};

describe('Admin Client Routes', () => {
  // ── Authentication ─────────────────────────────────────────
  describe('Authentication', () => {
    it('should reject requests without auth header', async () => {
      const res = await request(app).get('/admin/clients');
      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid auth', async () => {
      const res = await request(app)
        .get('/admin/clients')
        .set('Authorization', 'Bearer wrong-key');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /admin/clients ─────────────────────────────────────
  describe('GET /admin/clients', () => {
    it('should return empty list when no clients', async () => {
      const res = await request(app)
        .get('/admin/clients')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.clients).toEqual([]);
    });

    it('should return all clients', async () => {
      mockBQ._seedTable('Clients', [
        { client_id: 'c1', company_name: 'Alpha', status: 'active', plan_tier: 'insight', closer_count: 2, created_at: '2026-01-01' },
        { client_id: 'c2', company_name: 'Beta', status: 'active', plan_tier: 'growth', closer_count: 5, created_at: '2026-01-15' },
      ]);

      const res = await request(app)
        .get('/admin/clients')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.clients).toHaveLength(2);
    });

    it('should filter by status query param', async () => {
      mockBQ._seedTable('Clients', [
        { client_id: 'c1', company_name: 'Alpha', status: 'active' },
        { client_id: 'c2', company_name: 'Beta', status: 'inactive' },
      ]);

      const res = await request(app)
        .get('/admin/clients?status=active')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.clients).toHaveLength(1);
      expect(res.body.clients[0].client_id).toBe('c1');
    });
  });

  // ── GET /admin/clients/:clientId ───────────────────────────
  describe('GET /admin/clients/:clientId', () => {
    it('should return client details', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Acme Coaching',
        status: 'active',
        plan_tier: 'insight',
      }]);

      const res = await request(app)
        .get('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.client_id).toBe('c1');
      expect(res.body.company_name).toBe('Acme Coaching');
    });

    it('should return 404 for nonexistent client', async () => {
      const res = await request(app)
        .get('/admin/clients/nonexistent')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });
  });

  // ── POST /admin/clients ────────────────────────────────────
  describe('POST /admin/clients', () => {
    it('should create a new client with required fields', async () => {
      const res = await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send(VALID_CLIENT_BODY);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ok');
      expect(res.body.client_id).toBeDefined();
      expect(res.body.webhook_secret).toBeDefined();
      expect(res.body.webhook_secret.length).toBeGreaterThan(20);
      expect(res.body.transcript_webhook_url).toContain('/webhooks/transcript/fathom');
      expect(res.body.payment_webhook_url).toContain('/webhooks/payment');
      expect(res.body.next_steps).toHaveLength(4);
    });

    it('should persist client in database', async () => {
      await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send(VALID_CLIENT_BODY);

      const clients = mockBQ._getTable('Clients');
      expect(clients).toHaveLength(1);
      expect(clients[0].company_name).toBe('Acme Coaching');
      expect(clients[0].status).toBe('active');
      expect(clients[0].closer_count).toBe(0);
      expect(clients[0].offer_price).toBe(10000);
    });

    it('should write audit log on create', async () => {
      await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send(VALID_CLIENT_BODY);

      const audit = mockBQ._getTable('AuditLog');
      const clientAudit = audit.find(a => a.entity_type === 'client' && a.action === 'created');
      expect(clientAudit).toBeDefined();
      expect(clientAudit.new_value).toBe('Acme Coaching');
      expect(clientAudit.trigger_source).toBe('admin');
    });

    it('should include optional fields when provided', async () => {
      await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send({
          ...VALID_CLIENT_BODY,
          ai_prompt_overall: 'This is a coaching offer...',
          script_template: 'Step 1: Discovery...',
          name: 'John Founder',
        });

      const clients = mockBQ._getTable('Clients');
      expect(clients[0].ai_prompt_overall).toBe('This is a coaching offer...');
      expect(clients[0].script_template).toBe('Step 1: Discovery...');
      expect(clients[0].name).toBe('John Founder');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send({ company_name: 'Incomplete' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Missing required fields');
      expect(res.body.message).toContain('primary_contact_email');
    });

    it('should reject invalid plan_tier', async () => {
      const res = await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send({ ...VALID_CLIENT_BODY, plan_tier: 'platinum' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('plan_tier');
    });

    it('should reject non-positive offer_price', async () => {
      const res = await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send({ ...VALID_CLIENT_BODY, offer_price: -100 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('offer_price');
    });

    it('should default transcript_provider to fathom', async () => {
      await request(app)
        .post('/admin/clients')
        .set('Authorization', AUTH_HEADER)
        .send(VALID_CLIENT_BODY);

      const clients = mockBQ._getTable('Clients');
      expect(clients[0].transcript_provider).toBe('fathom');
    });
  });

  // ── PUT /admin/clients/:clientId ───────────────────────────
  describe('PUT /admin/clients/:clientId', () => {
    it('should update client fields', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Old Name',
        status: 'active',
        plan_tier: 'starter',
        offer_price: 5000,
      }]);

      const res = await request(app)
        .put('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER)
        .send({ company_name: 'New Name', plan_tier: 'growth' });

      expect(res.status).toBe(200);
      expect(res.body.company_name).toBe('New Name');
      expect(res.body.plan_tier).toBe('growth');
    });

    it('should write audit log on update', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        status: 'active',
      }]);

      await request(app)
        .put('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER)
        .send({ offer_price: 15000 });

      const audit = mockBQ._getTable('AuditLog');
      const updateAudit = audit.find(a => a.entity_type === 'client' && a.action === 'updated');
      expect(updateAudit).toBeDefined();
    });

    it('should prevent updating immutable fields', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        webhook_secret: 'original_secret',
        status: 'active',
      }]);

      await request(app)
        .put('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER)
        .send({ webhook_secret: 'hacked', company_name: 'Updated' });

      const clients = mockBQ._getTable('Clients');
      expect(clients[0].webhook_secret).toBe('original_secret');
      expect(clients[0].company_name).toBe('Updated');
    });

    it('should return 404 for nonexistent client', async () => {
      const res = await request(app)
        .put('/admin/clients/nonexistent')
        .set('Authorization', AUTH_HEADER)
        .send({ company_name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should reject empty update body (only immutable fields)', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        status: 'active',
      }]);

      const res = await request(app)
        .put('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER)
        .send({ client_id: 'hacked' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No updatable fields');
    });

    it('should validate plan_tier on update', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        status: 'active',
      }]);

      const res = await request(app)
        .put('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER)
        .send({ plan_tier: 'diamond' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('plan_tier');
    });

    it('should overwrite filter_word completely on PUT', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: '*',
        status: 'active',
      }]);

      const res = await request(app)
        .put('/admin/clients/c1')
        .set('Authorization', AUTH_HEADER)
        .send({ filter_word: 'Strategy' });

      expect(res.status).toBe(200);
      expect(res.body.filter_word).toBe('Strategy');
    });
  });

  // ── PATCH /admin/clients/:clientId/filter-words ──────────
  describe('PATCH /admin/clients/:clientId/filter-words', () => {
    it('should add new words to existing filter words', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: 'discovery,sales call',
        status: 'active',
      }]);

      const res = await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: ['strategy', 'intro call'] });

      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['strategy', 'intro call']);
      expect(res.body.filter_word).toBe('discovery,sales call,strategy,intro call');
    });

    it('should skip duplicates (case-insensitive)', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: 'Discovery,Sales Call',
        status: 'active',
      }]);

      const res = await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: ['discovery', 'new word'] });

      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['new word']);
      expect(res.body.filter_word).toBe('Discovery,Sales Call,new word');
    });

    it('should return ok with message when all words already exist', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: 'discovery',
        status: 'active',
      }]);

      const res = await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: ['Discovery'] });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('All words already exist');
    });

    it('should add words when filter_word is empty', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: '',
        status: 'active',
      }]);

      const res = await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: ['strategy'] });

      expect(res.status).toBe(200);
      expect(res.body.filter_word).toBe('strategy');
    });

    it('should reject missing or empty words array', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: 'discovery',
        status: 'active',
      }]);

      const res = await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: [] });

      expect(res.status).toBe(400);
    });

    it('should reject non-array words', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: 'discovery',
        status: 'active',
      }]);

      const res = await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: 'strategy' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for nonexistent client', async () => {
      const res = await request(app)
        .patch('/admin/clients/nonexistent/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: ['strategy'] });

      expect(res.status).toBe(404);
    });

    it('should write audit log with old and new values', async () => {
      mockBQ._seedTable('Clients', [{
        client_id: 'c1',
        company_name: 'Test',
        filter_word: 'discovery',
        status: 'active',
      }]);

      await request(app)
        .patch('/admin/clients/c1/filter-words')
        .set('Authorization', AUTH_HEADER)
        .send({ words: ['strategy'] });

      const audit = mockBQ._getTable('AuditLog');
      const entry = audit.find(a => a.trigger_detail === 'filter_word_add');
      expect(entry).toBeDefined();
      expect(entry.old_value).toBe('discovery');
      expect(entry.new_value).toBe('discovery,strategy');
    });
  });
});
