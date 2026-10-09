import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Security headers. The CSP allows exactly what the SPA loads: its own bundle,
 * Google Fonts, the same-origin socket, and the Stockfish worker, which compiles
 * WebAssembly ('wasm-unsafe-eval') and may spawn from a blob.
 */
const headers = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      workerSrc: ["'self'", 'blob:'],
      // React and the board library set inline style attributes.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      // Helmet's default would rewrite same-origin asset URLs to https on a plain-http
      // demo (localhost, an IP tunnel) and blank the page. HTTPS hosts get HSTS instead.
      upgradeInsecureRequests: null,
    },
  },
});

/** Ship-plan Phase 0: headers (0.3), proxy-aware client IPs (0.6), small bodies (0.9). */
export function applyHttpSecurity(app: NestExpressApplication) {
  // Swagger UI needs inline scripts; it only exists outside production anyway (0.4).
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/api/docs') ? next() : headers(req, res, next),
  );

  // Behind a host's proxy every request arrives from the proxy's IP, so all users
  // would share one throttle bucket. TRUST_PROXY = number of proxy hops in front
  // (1 on every common host). Off by default: trusting X-Forwarded-For with no
  // proxy in front lets a client pick its own IP and dodge the throttler.
  const hops = Number(process.env.TRUST_PROXY) || 0;
  if (hops > 0) app.set('trust proxy', hops);

  // Every request body here is a few hundred bytes (moves, logins, challenge settings).
  // The only parser: main.ts creates the app with `bodyParser: false`.
  app.useBodyParser('json', { limit: '16kb' });

  // Answer parser errors (413 too large, 400 malformed JSON) right here. Left to
  // propagate, @nestjs/serve-static 5's error handler turns any error on an
  // excluded /api route into a misleading "Cannot POST …" 404.
  app.use((err: { status?: number; type?: string; expose?: boolean; message?: string }, req: Request, res: Response, next: NextFunction) => {
    if (!err?.expose || !err.status || !err.type) return next(err); // not a body-parser error
    res.status(err.status).json({ statusCode: err.status, message: err.message, error: err.type });
  });
}
