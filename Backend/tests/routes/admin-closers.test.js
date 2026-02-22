/**
 * CLOSER ADMIN ROUTES — Integration Tests
 *
 * Tests closer CRUD operations via HTTP using supertest.
 * Covers: listing, adding, deactivating, validation, duplicate prevention.
 */

jest.mock('../../src/db/BigQueryClient', () => require('../helpers/mockBigQuery'));

const request = require('supertest');
const app = require('../../src/app');
const mockBQ = require('../helpers/mockBigQuery');
const config = require('../../src/config');

const ADMIN_KEY = 'test-admin-key-123';
const AUTH_HEADER = `Bearer ${ADMIN_KEY}`;
const CLIENT_ID = 'client_001';

beforeAll(() => {
  config.admin.apiKey = ADMIN_KEY;
});

beforeEach(() => {
  mockBQ._reset();
});

function seedClient(overrides = {}) {
  mockBQ._seedTable('Clients', [{
    client_id: CLIENT_ID,
    company_name: 'Acme Coaching',
    status: 'active',
    closer_count: 0,
    timezone: 'America/New_York',
    transcript_provider: 'fathom',
    ...overrides,
  }]);
}

function seedCloser(overrides = {}) {
  seedClient();
  mockBQ._seedTable('Closers', [{
    closer_id: 'closer_001',
    client_id: CLIENT_ID,
    name: 'Sarah Closer',
    work_email: 'sarah@acmecoaching.com',
    status: 'active',
    ...overrides,
  }]);
}

describe('Admin Closer Routes', () => {
  // ── GET /admin/clients/:clientId/closers ─────────────────
  describe('GET /admin/clients/:clientId/closers', () => {
    it('should return empty list when no closers', async () => {
      seedClient();

      const res = await request(app)
        .get(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.closers).toEqual([]);
    });

    it('should return closers for client', async () => {
      seedClient();
      mockBQ._seedTable('Closers', [
        { closer_id: 'c1', client_id: CLIENT_ID, name: 'Alice', work_email: 'alice@a.com', status: 'active' },
        { closer_id: 'c2', client_id: CLIENT_ID, name: 'Bob', work_email: 'bob@a.com', status: 'active' },
      ]);

      const res = await request(app)
        .get(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.closers).toHaveLength(2);
    });

    it('should include inactive when requested', async () => {
      seedClient();
      mockBQ._seedTable('Closers', [
        { closer_id: 'c1', client_id: CLIENT_ID, name: 'Alice', work_email: 'alice@a.com', status: 'active' },
        { closer_id: 'c2', client_id: CLIENT_ID, name: 'Bob', work_email: 'bob@a.com', status: 'inactive' },
      ]);

      const res = await request(app)
        .get(`/admin/clients/${CLIENT_ID}/closers?includeInactive=true`)
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.closers).toHaveLength(2);
    });

    it('should return 404 for nonexistent client', async () => {
      const res = await request(app)
        .get('/admin/clients/nonexistent/closers')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /admin/clients/:clientId/closers ────────────────
  describe('POST /admin/clients/:clientId/closers', () => {
    it('should add a closer to a client', async () => {
      seedClient();

      const res = await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Closer',
          work_email: 'sarah@acmecoaching.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('ok');
      expect(res.body.closer_id).toBeDefined();
      expect(res.body.message).toContain('sarah@acmecoaching.com');
    });

    it('should persist closer in database', async () => {
      seedClient();

      await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Closer',
          work_email: 'sarah@acmecoaching.com',
        });

      const closers = mockBQ._getTable('Closers');
      expect(closers).toHaveLength(1);
      expect(closers[0].name).toBe('Sarah Closer');
      expect(closers[0].work_email).toBe('sarah@acmecoaching.com');
      expect(closers[0].status).toBe('active');
      expect(closers[0].client_id).toBe(CLIENT_ID);
    });

    it('should increment client closer_count', async () => {
      seedClient({ closer_count: 2 });

      await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Closer',
          work_email: 'sarah@acmecoaching.com',
        });

      const clients = mockBQ._getTable('Clients');
      expect(clients[0].closer_count).toBe(3);
    });

    it('should write audit log on create', async () => {
      seedClient();

      await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Closer',
          work_email: 'sarah@acmecoaching.com',
        });

      const audit = mockBQ._getTable('AuditLog');
      const closerAudit = audit.find(a => a.entity_type === 'closer' && a.action === 'created');
      expect(closerAudit).toBeDefined();
      expect(closerAudit.new_value).toBe('sarah@acmecoaching.com');
    });

    it('should inherit timezone from client if not provided', async () => {
      seedClient({ timezone: 'America/Chicago' });

      await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Closer',
          work_email: 'sarah@acmecoaching.com',
        });

      const closers = mockBQ._getTable('Closers');
      expect(closers[0].timezone).toBe('America/Chicago');
    });

    it('should reject missing name', async () => {
      seedClient();

      const res = await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({ work_email: 'sarah@acmecoaching.com' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('name');
    });

    it('should reject missing work_email', async () => {
      seedClient();

      const res = await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'Sarah' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('work_email');
    });

    it('should reject duplicate work_email within same client', async () => {
      seedCloser();

      const res = await request(app)
        .post(`/admin/clients/${CLIENT_ID}/closers`)
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Duplicate',
          work_email: 'sarah@acmecoaching.com',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should return 404 for nonexistent client', async () => {
      const res = await request(app)
        .post('/admin/clients/nonexistent/closers')
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'Sarah Closer',
          work_email: 'sarah@acmecoaching.com',
        });

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /admin/clients/:clientId/closers/:closerId ─────
  describe('DELETE /admin/clients/:clientId/closers/:closerId', () => {
    it('should deactivate a closer', async () => {
      seedCloser();
      // Update closer_count to reflect the closer
      mockBQ._getTable('Clients')[0].closer_count = 1;

      const res = await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/closer_001`)
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('deactivated');
      expect(res.body.message).toContain('Historical data preserved');
    });

    it('should set closer status to inactive', async () => {
      seedCloser();

      await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/closer_001`)
        .set('Authorization', AUTH_HEADER);

      const closers = mockBQ._getTable('Closers');
      expect(closers[0].status).toBe('inactive');
    });

    it('should decrement client closer_count', async () => {
      seedCloser();
      mockBQ._getTable('Clients')[0].closer_count = 3;

      await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/closer_001`)
        .set('Authorization', AUTH_HEADER);

      const clients = mockBQ._getTable('Clients');
      expect(clients[0].closer_count).toBe(2);
    });

    it('should write audit log on deactivate', async () => {
      seedCloser();

      await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/closer_001`)
        .set('Authorization', AUTH_HEADER);

      const audit = mockBQ._getTable('AuditLog');
      const deactivateAudit = audit.find(a => a.entity_type === 'closer' && a.action === 'deactivated');
      expect(deactivateAudit).toBeDefined();
      expect(deactivateAudit.old_value).toBe('active');
      expect(deactivateAudit.new_value).toBe('inactive');
    });

    it('should not allow deactivating an already inactive closer', async () => {
      seedCloser({ status: 'inactive' });

      const res = await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/closer_001`)
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already deactivated');
    });

    it('should return 404 for nonexistent closer', async () => {
      seedClient();

      const res = await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/nonexistent`)
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Closer not found');
    });

    it('should return 404 for nonexistent client', async () => {
      const res = await request(app)
        .delete('/admin/clients/nonexistent/closers/closer_001')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Client not found');
    });

    it('should not go below 0 closer_count', async () => {
      seedCloser();
      mockBQ._getTable('Clients')[0].closer_count = 0;

      await request(app)
        .delete(`/admin/clients/${CLIENT_ID}/closers/closer_001`)
        .set('Authorization', AUTH_HEADER);

      const clients = mockBQ._getTable('Clients');
      expect(clients[0].closer_count).toBe(0);
    });
  });
});
