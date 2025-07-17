import pino, { Logger } from 'pino';

export const logger: Logger =
  process.env.NODE_ENV === 'production'
    ? // JSON in production for Vercel
      pino({
        level: 'info',
        formatters: {
          level: (label) => {
            return { severity: label.toUpperCase() };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      })
    : // Pretty print in development
      pino({
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
        level: 'debug',
      });

// Create contextual loggers for different modules
export const createLogger = (
  module: string,
  context?: Record<string, unknown>
) => {
  return logger.child({ module, ...context });
};

// Helper to create a request logger with webhook context
export const createWebhookLogger = (
  type: string,
  webhookId?: string,
  organizationId?: string
) => {
  return logger.child({
    module: 'webhook',
    webhookType: type,
    ...(webhookId && { webhookId }),
    ...(organizationId && { organizationId }),
  });
};

// Helper to create a logger for API clients
export const createApiLogger = (apiName: string) => {
  return logger.child({
    module: 'api',
    apiName,
  });
};
