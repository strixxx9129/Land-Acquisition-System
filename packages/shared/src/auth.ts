import { z } from 'zod';
import { localizedTextSchema } from './i18n.js';
import { permissionCodeSchema, userScopeSchema } from './access.js';

export const loginRequestSchema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  locale: z.string(),
  role: z.object({ code: z.string(), name: localizedTextSchema }),
  scope: userScopeSchema,
  scopeLabel: localizedTextSchema,
  permissions: z.array(permissionCodeSchema),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const demoAccountSchema = z.object({
  email: z.string(),
  roleName: localizedTextSchema,
  scopeLabel: localizedTextSchema,
});
export type DemoAccount = z.infer<typeof demoAccountSchema>;
