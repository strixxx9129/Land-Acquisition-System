import { pino } from 'pino';
import { config, isProd, isTest } from './config.js';

export const logger = pino({
  level: isTest ? 'silent' : config.LOG_LEVEL,
  // Never let credentials or personal identifiers reach the logs.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.passwordHash', '*.aadhaar', '*.bankAccount'],
    censor: '[redacted]',
  },
  ...(isProd || isTest ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
});
