import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';

const isProd = process.env.NODE_ENV === 'production';

/** Challenge share tokens grant "accept this game", so they never reach a log line. */
const maskUrl = (url = '') => url.replace(/(\/challenge\/)[^/?]+/, '$1:token');

/**
 * Pino (ship-plan 0.13): JSON lines in production, one readable line per event in
 * dev (pino-pretty). Every HTTP request gets an id, echoed as `x-request-id`, so a
 * user's error report can be matched to its log line. Nest's own `Logger` calls
 * route through this too (`app.useLogger` in main.ts).
 */
export const loggerModule = LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    transport: isProd
      ? undefined
      : {
          target: 'pino-pretty',
          // Dev reads as a story: "game_over [GameGateway] {roomId, result, …}".
          // Production keeps every field (including req.id) as JSON.
          options: {
            singleLine: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,context,event,req',
            messageFormat: '{if event}{event}{end}{msg} {if context}[{context}]{end}',
          },
        },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = (req.headers['x-request-id'] as string) || randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    // Request logs carry method, masked URL and status only: no headers, no bodies.
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: maskUrl(req.url) }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    // Backstop for anything logged by hand that carries a secret field.
    redact: {
      paths: ['*.password', '*.passwordHash', '*.token', '*.accessToken', '*.refreshToken', '*.email', '*.authorization', '*.cookie'],
      censor: '[redacted]',
    },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customSuccessMessage: (req, res) => `${req.method} ${maskUrl(req.url)} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${maskUrl(req.url)} ${res.statusCode}`,
    // The SPA's static files are noise; log the API only.
    autoLogging: { ignore: (req) => !req.url?.startsWith('/api') },
  },
});
