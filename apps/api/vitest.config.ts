import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Applied before any module loads, so src/config.ts sees them.
    env: {
      NODE_ENV: 'test',
      LOGIN_RATE_LIMIT_PER_15_MIN: '1000',
      BCRYPT_COST: '8',
      DEMO_MODE: 'true',
    },
    // Each test file gets its own in-memory replica set; the first run downloads a mongod binary.
    hookTimeout: 180_000,
    testTimeout: 20_000,
  },
});
