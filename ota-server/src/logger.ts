import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino(
  isDev
    ? {
        level: process.env.LOG_LEVEL ?? 'debug',
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }
    : {
        level: process.env.LOG_LEVEL ?? 'info',
      },
);

export default logger;
