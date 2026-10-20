import { afterAll, beforeAll } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { seedAll } from '../src/seed/run.js';

beforeAll(async () => {
  await connectDatabase();
  await seedAll();
});

afterAll(async () => {
  await disconnectDatabase();
});
