import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { apiErrorSchema, authUserSchema, demoAccountSchema, healthSchema, loginRequestSchema, loginResponseSchema, permissionCodeSchema } from '@lams/shared';
import { config } from './config.js';

/**
 * API documentation generated from the same Zod schemas the handlers validate with,
 * so the docs cannot drift from the code. Served at /api/docs.
 */
const registry = new OpenAPIRegistry();
const bearer = registry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
const secured = [{ [bearer.name]: [] }];
const error = (description: string) => ({ description, content: { 'application/json': { schema: apiErrorSchema } } });
const json = (schema: z.ZodType, description = 'OK') => ({ description, content: { 'application/json': { schema } } });

registry.registerPath({ method: 'get', path: '/api/health', tags: ['Health'], summary: 'Liveness (used by uptime monitors)', responses: { 200: json(healthSchema) } });
registry.registerPath({
  method: 'get',
  path: '/api/health/ready',
  tags: ['Health'],
  summary: 'Readiness, including database connectivity',
  responses: { 200: { description: 'Ready' }, 503: { description: 'A dependency is down' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  summary: 'Sign in. Returns a 15-minute access token and sets an httpOnly refresh cookie.',
  request: { body: { content: { 'application/json': { schema: loginRequestSchema } } } },
  responses: { 200: json(loginResponseSchema), 401: error('Wrong email or password'), 423: error('Account temporarily locked'), 429: error('Rate limited') },
});
registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotate the refresh cookie and get a new access token. Reusing an old refresh token revokes the session.',
  responses: { 200: json(loginResponseSchema), 401: error('No valid session') },
});
registry.registerPath({ method: 'post', path: '/api/auth/logout', tags: ['Auth'], summary: 'End the session', responses: { 204: { description: 'Signed out' } } });
registry.registerPath({ method: 'get', path: '/api/auth/me', tags: ['Auth'], security: secured, summary: 'Current user, role, jurisdiction and permissions', responses: { 200: json(authUserSchema), 401: error('Not signed in') } });
registry.registerPath({
  method: 'get',
  path: '/api/auth/demo-accounts',
  tags: ['Auth'],
  summary: 'Demo logins for judges (only when DEMO_MODE=true)',
  responses: { 200: json(z.object({ password: z.string(), accounts: z.array(demoAccountSchema) })), 404: error('Demo mode is off') },
});

registry.registerPath({
  method: 'get',
  path: '/api/admin/roles',
  tags: ['Admin'],
  security: secured,
  summary: 'Roles with their permissions, plus the permission catalogue',
  responses: { 200: { description: 'OK' }, 403: error('Missing admin.roles.manage') },
});
registry.registerPath({
  method: 'patch',
  path: '/api/admin/roles/{code}',
  tags: ['Admin'],
  security: secured,
  summary: 'Change a role\'s name or permissions (audited, takes effect within seconds)',
  request: {
    params: z.object({ code: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ permissions: z.array(permissionCodeSchema).optional() }) } } },
  },
  responses: { 200: { description: 'Updated role' }, 400: error('Invalid change'), 403: error('Missing admin.roles.manage') },
});
registry.registerPath({
  method: 'get',
  path: '/api/users',
  tags: ['Users'],
  security: secured,
  summary: 'Users within the caller\'s jurisdiction',
  request: { query: z.object({ page: z.number().int().optional(), pageSize: z.number().int().optional() }) },
  responses: { 200: { description: 'Paged users' }, 403: error('Missing admin.users.read') },
});
registry.registerPath({
  method: 'get',
  path: '/api/masters/jurisdictions',
  tags: ['Masters'],
  security: secured,
  summary: 'LGD-coded states, districts and villages',
  request: { query: z.object({ level: z.string().optional(), parentCode: z.string().optional(), stateCode: z.string().optional() }) },
  responses: { 200: { description: 'OK' } },
});
registry.registerPath({ method: 'get', path: '/api/masters/organizations', tags: ['Masters'], security: secured, summary: 'Land requiring bodies and agencies', responses: { 200: { description: 'OK' } } });

let cached: unknown;
export function openApiDocument() {
  cached ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'National Land Acquisition & Management System API',
      version: config.APP_VERSION,
      description: 'Prototype for SIH 26016. All data is synthetic. Errors always have the shape `{ error: { code, message, requestId } }`.',
    },
  });
  return cached;
}
