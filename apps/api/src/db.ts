import mongoose from 'mongoose';
import { config, isProd } from './config.js';
import { logger } from './logger.js';

// Operator injection (`{ email: { $ne: null } }`) is stopped at the edge: every handler parses its
// input with Zod into primitives before building a filter. Global `sanitizeFilter` is not used
// because it also neuters the server's own `$in`/`$exists` filters.
mongoose.set('strictQuery', true);

let memoryServer: { stop(): Promise<unknown> } | null = null;

/**
 * Connects to MONGODB_URI, or in development without one, to a throwaway in-memory
 * replica set (a replica set because workflow and payment changes use transactions).
 * Returns true when the database is a fresh in-memory one that needs seeding.
 */
export async function connectDatabase(): Promise<{ ephemeral: boolean }> {
  let uri = config.MONGODB_URI;
  let ephemeral = false;
  if (!uri) {
    if (isProd) throw new Error('MONGODB_URI is required in production');
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    logger.info('MONGODB_URI not set: starting an in-memory MongoDB replica set (data is lost on restart)');
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    memoryServer = replSet;
    uri = replSet.getUri('lams');
    ephemeral = true;
  }
  await mongoose.connect(uri, {
    // Small pool: the free Atlas tier caps connections and one Render instance needs few.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15_000,
  });
  logger.info({ db: mongoose.connection.name }, 'database connected');
  return { ephemeral };
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  await memoryServer?.stop();
}
