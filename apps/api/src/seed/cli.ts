import { config } from '../config.js';
import { connectDatabase, disconnectDatabase } from '../db.js';
import { logger } from '../logger.js';
import { seedAll } from './run.js';

// `npm run seed` — seeds the database in MONGODB_URI (e.g. your Atlas cluster).
// Local development without MONGODB_URI doesn't need this: the in-memory database seeds itself on start.
if (!config.MONGODB_URI) {
  console.error('Set MONGODB_URI to the database you want to seed (see apps/api/.env.example).');
  process.exit(1);
}
// Never fall back to the development default when seeding a real database.
if (!process.env.DEMO_USER_PASSWORD) {
  console.error('Set DEMO_USER_PASSWORD explicitly; it becomes the password of every demo account.');
  process.exit(1);
}

try {
  await connectDatabase();
  await seedAll();
} catch (err) {
  logger.fatal({ err }, 'seed failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
