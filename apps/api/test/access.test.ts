import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { runAsSystem } from '../src/modules/access/context.js';
import { AuditLog } from '../src/modules/audit/auditLog.model.js';
import { app, asUser, login } from './helpers.js';

const emailsOf = (body: { items: { email: string }[] }) => body.items.map((u) => u.email);

describe('user listing respects jurisdiction through the real API', () => {
  it('shows a district collector only their district', async () => {
    const { token } = await login('collector.pune@demo.lams.test');
    const res = await asUser(token).get('/api/users?pageSize=100');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((u: { districtCode?: string }) => u.districtCode === '2701')).toBe(true);
    expect(emailsOf(res.body)).not.toContain('collector.nashik@demo.lams.test');
  });

  it('shows a state officer every district in the state but not other states', async () => {
    const { token } = await login('state.mh@demo.lams.test');
    const res = await asUser(token).get('/api/users?pageSize=100');
    const emails = emailsOf(res.body);
    expect(emails).toContain('collector.pune@demo.lams.test');
    expect(emails).toContain('collector.nashik@demo.lams.test');
    expect(emails).not.toContain('state.up@demo.lams.test');
  });

  it('shows the ministry everyone', async () => {
    const { token } = await login('ministry@demo.lams.test');
    const res = await asUser(token).get('/api/users?pageSize=100');
    expect(res.body.total).toBeGreaterThanOrEqual(11);
  });

  it('forbids roles without the permission', async () => {
    const { token } = await login('field.pune@demo.lams.test');
    const res = await asUser(token).get('/api/users');
    expect(res.status).toBe(403);
  });
});

describe('roles are configuration, editable at runtime', () => {
  it('forbids non-admins from changing roles', async () => {
    const { token } = await login('collector.pune@demo.lams.test');
    const res = await asUser(token).patch('/api/admin/roles/FIELD_OFFICER', { permissions: ['admin.users.read'] });
    expect(res.status).toBe(403);
  });

  it('lets an admin grant a permission, which takes effect without code changes, and audits it', async () => {
    const field = await login('field.pune@demo.lams.test');
    expect((await asUser(field.token).get('/api/users')).status).toBe(403);

    const admin = await login('admin@demo.lams.test');
    const current = (await asUser(admin.token).get('/api/admin/roles')).body.roles.find((r: { code: string }) => r.code === 'FIELD_OFFICER');
    const res = await asUser(admin.token).patch('/api/admin/roles/FIELD_OFFICER', { permissions: [...current.permissions, 'admin.users.read'] });
    expect(res.status).toBe(200);

    expect((await asUser(field.token).get('/api/users')).status).toBe(200);
    const entry = await runAsSystem('test', () => AuditLog.findOne({ action: 'role.update', entityId: 'FIELD_OFFICER' }).lean());
    expect(entry?.actorKind).toBe('user');
  });

  it('rejects permission codes the system does not know', async () => {
    const admin = await login('admin@demo.lams.test');
    const res = await asUser(admin.token).patch('/api/admin/roles/FIELD_OFFICER', { permissions: ['launch.missiles'] });
    expect(res.status).toBe(400);
  });

  it('stops an admin from locking themselves out', async () => {
    const admin = await login('admin@demo.lams.test');
    const res = await asUser(admin.token).patch('/api/admin/roles/SYSTEM_ADMIN', { permissions: ['masters.read'] });
    expect(res.status).toBe(400);
  });
});

describe('platform', () => {
  it('answers health checks without auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const ready = await request(app).get('/api/health/ready');
    expect(ready.body.checks.database).toBe('ok');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBeTypeOf('string');
  });

  it('serves the docs page with or without a trailing slash (the Vercel rewrite strips it)', async () => {
    for (const path of ['/api/docs', '/api/docs/']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.text).toContain('/api/docs/assets/swagger-ui-bundle.js');
    }
    expect((await request(app).get('/api/docs/init.js')).status).toBe(200);
    expect((await request(app).get('/api/docs/assets/swagger-ui.css')).status).toBe(200);
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.paths).toHaveProperty('/api/auth/login');
  });
});
