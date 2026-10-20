import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { logger } from './logger.js';
import { seedAll } from './seed/run.js';

async function main() {
  const { ephemeral } = await connectDatabase();
  if (ephemeral) await seedAll();

  const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV, version: config.APP_VERSION }, 'API listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Render sends SIGTERM and waits ~30 s; don't hang past that.
    setTimeout(() => process.exit(1), 25_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
