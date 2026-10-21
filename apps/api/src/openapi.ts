import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  apiErrorSchema,
  authUserSchema,
  createCaseSchema,
  demoAccountSchema,
  healthSchema,
  loginRequestSchema,
  loginResponseSchema,
  permissionCodeSchema,
  transitionRequestSchema,
  updateProposalSchema,
  workflowContentSchema,
} from '@lams/shared';
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

const caseId = z.object({ id: z.string().describe('Case id (24 hex characters)') });
const workflowKey = z.object({ code: z.string(), version: z.number().int() });

registry.registerPath({
  method: 'get',
  path: '/api/cases',
  tags: ['Cases'],
  security: secured,
  summary: 'Cases in the caller\'s jurisdiction, with stage, SLA and next statutory deadline',
  request: {
    query: z.object({
      status: z.enum(['ACTIVE', 'COMPLETED', 'REJECTED', 'WITHDRAWN', 'LAPSED']).optional(),
      stage: z.string().optional(),
      workflowCode: z.string().optional(),
      districtCode: z.string().optional(),
      q: z.string().optional().describe('Search in title or case number'),
      page: z.number().int().optional(),
      pageSize: z.number().int().optional(),
    }),
  },
  responses: { 200: { description: 'Paged case summaries' }, 403: error('Missing case.read') },
});
registry.registerPath({
  method: 'get',
  path: '/api/cases/inbox',
  tags: ['Cases'],
  security: secured,
  summary: 'Cases waiting for the caller\'s role to act, oldest first',
  responses: { 200: { description: 'Case summaries' } },
});
registry.registerPath({
  method: 'get',
  path: '/api/cases/meta/options',
  tags: ['Cases'],
  security: secured,
  summary: 'Choices for the proposal form (active frameworks, districts, organisations)',
  responses: { 200: { description: 'OK' } },
});
registry.registerPath({
  method: 'post',
  path: '/api/cases',
  tags: ['Cases'],
  security: secured,
  summary: 'Create a proposal (draft) in the initial stage of the framework\'s active workflow version',
  request: { body: { content: { 'application/json': { schema: createCaseSchema } } } },
  responses: { 201: { description: 'Case detail' }, 400: error('Invalid proposal'), 403: error('Missing case.create or outside jurisdiction') },
});
registry.registerPath({
  method: 'get',
  path: '/api/cases/{id}',
  tags: ['Cases'],
  security: secured,
  summary: 'Case detail: stage, statutory deadlines, actions available to the caller, full history',
  request: { params: caseId },
  responses: { 200: { description: 'Case detail' }, 404: error('Not found or outside jurisdiction') },
});
registry.registerPath({
  method: 'patch',
  path: '/api/cases/{id}',
  tags: ['Cases'],
  security: secured,
  summary: 'Edit proposal details while the current stage allows editing',
  request: { params: caseId, body: { content: { 'application/json': { schema: updateProposalSchema } } } },
  responses: { 200: { description: 'Case detail' }, 409: error('Stage does not allow edits, or stale version') },
});
registry.registerPath({
  method: 'post',
  path: '/api/cases/{id}/transitions',
  tags: ['Cases'],
  security: secured,
  summary: 'Take a workflow action. Atomic with its history entry; expectedVersion guards against concurrent changes.',
  request: { params: caseId, body: { content: { 'application/json': { schema: transitionRequestSchema } } } },
  responses: {
    200: { description: 'Updated case detail' },
    400: error('Missing remarks or invalid inputs'),
    403: error('Role may not take this action'),
    404: error('Not found or outside jurisdiction'),
    409: error('INVALID_TRANSITION, STALE_VERSION or case closed'),
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/cases/{id}/integrity',
  tags: ['Cases'],
  security: secured,
  summary: 'Recompute the history hash chain and report whether it is intact',
  request: { params: caseId },
  responses: { 200: json(z.object({ intact: z.boolean(), events: z.number(), brokenAt: z.number().optional(), reason: z.string().optional() })) },
});

registry.registerPath({ method: 'get', path: '/api/workflows', tags: ['Workflows'], security: secured, summary: 'Workflows and their versions', responses: { 200: { description: 'OK' } } });
registry.registerPath({
  method: 'get',
  path: '/api/workflows/{code}/versions/{version}',
  tags: ['Workflows'],
  security: secured,
  summary: 'One workflow version: stages, transitions, inputs, SLAs, statutory deadlines',
  request: { params: workflowKey },
  responses: { 200: { description: 'OK' }, 404: error('Not found') },
});
registry.registerPath({
  method: 'post',
  path: '/api/workflows/validate',
  tags: ['Workflows'],
  security: secured,
  summary: 'Dry-run validation of a workflow definition (schema + cross-references + reachability)',
  request: { body: { content: { 'application/json': { schema: z.object({ content: workflowContentSchema }) } } } },
  responses: { 200: json(z.object({ valid: z.literal(true) })), 400: error('WORKFLOW_INVALID with a list of problems') },
});
registry.registerPath({
  method: 'post',
  path: '/api/workflows/{code}/versions',
  tags: ['Workflows'],
  security: secured,
  summary: 'Save a new draft version (or version 1 of a new workflow)',
  request: { params: z.object({ code: z.string() }), body: { content: { 'application/json': { schema: z.object({ content: workflowContentSchema, notes: z.string().optional() }) } } } },
  responses: { 201: { description: 'Draft created' }, 400: error('WORKFLOW_INVALID'), 403: error('Missing workflow.config.manage') },
});
registry.registerPath({
  method: 'put',
  path: '/api/workflows/{code}/versions/{version}',
  tags: ['Workflows'],
  security: secured,
  summary: 'Edit a draft version (active and retired versions are frozen)',
  request: { params: workflowKey, body: { content: { 'application/json': { schema: z.object({ content: workflowContentSchema, notes: z.string().optional() }) } } } },
  responses: { 200: { description: 'Updated' }, 409: error('Not a draft') },
});
registry.registerPath({
  method: 'post',
  path: '/api/workflows/{code}/versions/{version}/activate',
  tags: ['Workflows'],
  security: secured,
  summary: 'Activate a draft. New cases use it; existing cases keep the version they started on.',
  request: { params: workflowKey },
  responses: { 200: { description: 'Activated' }, 409: error('Not a draft') },
});

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
