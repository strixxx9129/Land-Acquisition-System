import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';

export const app = createApp();
export const DEMO_PASSWORD = config.DEMO_USER_PASSWORD!;

export async function login(email: string, password = DEMO_PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('lams_rt='))!;
  return { token: res.body.accessToken as string, cookie: cookie.split(';')[0]!, body: res.body };
}

export function asUser(token: string) {
  return {
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string, body: object) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
  };
}
