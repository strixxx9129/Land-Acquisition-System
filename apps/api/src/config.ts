import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

/** Development-only fallbacks so `npm run dev` works without a .env file. Production refuses them. */
const DEV_DEFAULTS = {
  JWT_ACCESS_SECRET: 'dev-only-access-secret-change-me-0123456789abcdef',
  DEMO_USER_PASSWORD: 'Demo@Lams2026',
};

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Render injects PORT in production. Locally, PORT often belongs to the web dev server, so API_PORT is used. */
    PORT: z.coerce.number().int().positive().default(4000),
    API_PORT: z.coerce.number().int().positive().default(4000),
    APP_VERSION: z.string().default(process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    /** Unset in development => an in-memory MongoDB replica set is started and seeded. */
    MONGODB_URI: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_COST: z.coerce.number().int().min(8).max(14).default(10),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

    /** Browser origins allowed to call the API directly (the Vercel app normally proxies, so this is a fallback). */
    CORS_ORIGINS: csv,
    /** Number of proxy hops in front of the API (Vercel rewrite + Render router = 2). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_PER_15_MIN: z.coerce.number().int().positive().default(600),
    LOGIN_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().positive().default(20),

    DEMO_MODE: bool,
    DEMO_USER_PASSWORD: z.string().min(8).optional(),
  })
  .transform((env) => ({
    ...env,
    PORT: isProduction ? env.PORT : env.API_PORT,
    DEMO_MODE: process.env.DEMO_MODE === undefined ? !isProduction : env.DEMO_MODE,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? (isProduction ? undefined : DEV_DEFAULTS.JWT_ACCESS_SECRET),
    DEMO_USER_PASSWORD: env.DEMO_USER_PASSWORD ?? (isProduction ? undefined : DEV_DEFAULTS.DEMO_USER_PASSWORD),
  }))
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const missing = (key: string) => ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
    if (!env.MONGODB_URI) missing('MONGODB_URI');
    if (!env.JWT_ACCESS_SECRET) missing('JWT_ACCESS_SECRET');
    if (env.JWT_ACCESS_SECRET === DEV_DEFAULTS.JWT_ACCESS_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'the development secret cannot be used in production' });
    }
    if (env.DEMO_MODE && !env.DEMO_USER_PASSWORD) missing('DEMO_USER_PASSWORD');
  });

export type Config = z.infer<typeof envSchema> & { JWT_ACCESS_SECRET: string };

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // Fail fast with a readable message rather than a stack trace deep in some module.
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  return parsed.data as Config;
}

export const config = loadConfig();
export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
