import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { app, asUser, login } from './helpers.js';

describe('login', () => {
  it('returns an access token, the user profile and an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'Collector.Pune@demo.lams.test', password: config.DEMO_USER_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({
      email: 'collector.pune@demo.lams.test',
      role: { code: 'DISTRICT_COLLECTOR' },
      scope: { level: 'DISTRICT', stateCode: '27', districtCode: '2701' },
      scopeLabel: { en: 'Pune, Maharashtra' },
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/lams_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'lao.pune@demo.lams.test', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('gives an unknown email the same response as a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@demo.lams.test', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('blocks NoSQL operator injection in the email field', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
  });

  it(`locks the account after ${config.LOGIN_MAX_ATTEMPTS} failed attempts, even for the right password`, async () => {
    const email = 'rr.pune@demo.lams.test';
    for (let i = 0; i < config.LOGIN_MAX_ATTEMPTS; i++) {
      await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    }
    const res = await request(app).post('/api/auth/login').send({ email, password: config.DEMO_USER_PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('access tokens', () => {
  it('are required for protected routes', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('identify the user on /me', async () => {
    const { token } = await login('ministry@demo.lams.test');
    const res = await asUser(token).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.scope.level).toBe('NATIONAL');
    expect(res.body.permissions).toContain('dashboard.read');
  });

  it('are rejected once expired', async () => {
    const { body } = await login('ministry@demo.lams.test');
    const expired = jwt.sign({ sub: body.user.id, role: 'MINISTRY_OFFICER', tv: 1, exp: Math.floor(Date.now() / 1000) - 10 }, config.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      issuer: 'lams-api',
      audience: 'lams-web',
    });
    const res = await asUser(expired).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('are rejected when unsigned (alg: none)', async () => {
    const { body } = await login('ministry@demo.lams.test');
    const forged = jwt.sign({ sub: body.user.id, role: 'SYSTEM_ADMIN', tv: 1 }, '', { algorithm: 'none', issuer: 'lams-api', audience: 'lams-web' });
    const res = await asUser(forged).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('are rejected when signed with another key', async () => {
    const { body } = await login('ministry@demo.lams.test');
    const forged = jwt.sign({ sub: body.user.id, role: 'SYSTEM_ADMIN', tv: 1 }, 'some-other-secret-that-is-long-enough-1234', {
      algorithm: 'HS256',
      issuer: 'lams-api',
      audience: 'lams-web',
    });
    const res = await asUser(forged).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('refresh tokens', () => {
  it('rotate on use', async () => {
    const { cookie } = await login('state.mh@demo.lams.test');
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    const next = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('lams_rt='))!;
    expect(next.split(';')[0]).not.toBe(cookie);
  });

  it('revoke the whole session when an old token is replayed', async () => {
    const { cookie: first } = await login('state.up@demo.lams.test');
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', first);
    const second = ([] as string[]).concat(rotated.headers['set-cookie'] ?? []).find((c) => c.startsWith('lams_rt='))!.split(';')[0]!;

    // An attacker replays the stolen first token...
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    // ...and the legitimate user's newer token is now dead too, forcing a fresh sign-in.
    const legit = await request(app).post('/api/auth/refresh').set('Cookie', second);
    expect(legit.status).toBe(401);
  });

  it('stop working after logout', async () => {
    const { cookie } = await login('finance.pune@demo.lams.test');
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('reject garbage', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'lams_rt=000000000000000000000000.abc');
    expect(res.status).toBe(401);
  });
});

describe('demo accounts', () => {
  it('lists one login per seeded demo user when DEMO_MODE is on', async () => {
    const res = await request(app).get('/api/auth/demo-accounts');
    expect(res.status).toBe(200);
    expect(res.body.accounts.length).toBeGreaterThanOrEqual(9);
    expect(res.body.accounts[0]).toHaveProperty('roleName.en');
  });
});
