// The Hono app: security headers, request ids and logs, tenant, Better-Auth at /api/auth/*,
// module routes, /healthz, /api/openapi.json and the built SPA with a history fallback.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { except } from 'hono/combine';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { devRoutes } from './dev-routes';
import { CLIENT_IP_HEADER } from './platform/auth';
import { signInMethods } from './platform/config';
import { pingDatabase } from './platform/db/pool';
import { AppError, toErrorBody } from './platform/errors';
import type { AppEnv } from './platform/http/context';
import {
  createGuards,
  requestLogging,
  type RequestObserver,
  sessionContext,
  tenantContext,
} from './platform/http/middleware';
import { auditRoutes } from './modules/audit/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { createSessionUserResolver } from './modules/identity';
import { identityRoutes } from './modules/identity/routes';
import { foundItemsRoutes, itemsRoutes } from './modules/items/routes';
import { claimsRoutes } from './modules/claims/routes';
import { dispatchRoutes } from './modules/dispatch/routes';
import { matchingRoutes } from './modules/matching/routes';
import { notificationsRoutes } from './modules/notifications/routes';
import { photosRoutes } from './modules/photos/routes';
import { supervisionRoutes } from './modules/supervision/routes';
import type { Services } from './services';

export type AppOptions = {
  /** Built SPA (apps/web/dist) to serve; null in development, where Vite serves it. */
  webDist: string | null;
  /** True while pg-boss is running (for /healthz). */
  jobsRunning: () => boolean;
  /** Called after every request; the API test harness uses it to record which routes were tested. */
  observe?: RequestObserver;
};

export const API_INFO = {
  openapi: '3.1.0',
  info: {
    title: 'NSU Lost & Found API',
    version: '0.1.0',
    description: 'Campus Lost & Found portal. All routes except /api/tenant need a session cookie.',
  },
} as const;

export function createApp(services: Services, options: AppOptions) {
  const { config, logger, clock, db } = services;
  const production = config.nodeEnv === 'production';
  const app = new OpenAPIHono<AppEnv>();

  app.use('*', requestId({ generator: () => randomUUID() }));
  app.use('*', requestLogging(logger, clock, options.observe));
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          ...(config.storage.driver === 's3' ? [new URL(config.storage.endpoint).origin] : []),
        ],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
      strictTransportSecurity: production ? 'max-age=31536000; includeSubDomains' : false,
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use('/api/*', cors({ origin: config.appOrigin, credentials: true }));
  app.use('/api/*', csrf({ origin: config.appOrigin }));
  // 1 MB for JSON everywhere; photo uploads get 10 MB (plan §6.1; the browser resizes first).
  const jsonLimit = bodyLimit({
    maxSize: 1024 * 1024,
    onError: () => {
      throw new AppError(
        'validation',
        'That request is too large; shorten the text and try again.',
      );
    },
  });
  const photoLimit = bodyLimit({
    maxSize: 10 * 1024 * 1024,
    onError: () => {
      throw new AppError('validation', 'That photo is too large; choose one under 10 MB.');
    },
  });
  app.use('/api/photos', photoLimit);
  app.use('/api/*', except('/api/photos', jsonLimit));

  app.get('/healthz', async (c) => {
    const [database, storage] = await Promise.all([
      pingDatabase(db),
      services.storage.healthCheck(),
    ]);
    const jobs = options.jobsRunning();
    const ok = database && jobs;
    return c.json({ status: ok ? 'ok' : 'unavailable', database, jobs, storage }, ok ? 200 : 503);
  });

  // Everything under /api knows its tenant (from the Host header) before anything else runs.
  app.use('/api/*', tenantContext(services.tenants));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => {
    const headers = new Headers(c.req.raw.headers);
    headers.delete(CLIENT_IP_HEADER);
    const address = clientAddress(c, config.clientIpHeader);
    if (address) headers.set(CLIENT_IP_HEADER, address);
    return services.auth
      .handler(new Request(c.req.raw, { headers }))
      .then((res) => ssoErrorRedirect(c.req.path, res, config.appOrigin));
  });

  const resolveUser = createSessionUserResolver({ db, clock }, (headers) =>
    services.auth.api.getSession({ headers }),
  );
  app.use('/api/*', sessionContext(resolveUser));

  const guards = createGuards({ clock, db });
  app.route('/', identityRoutes(guards));
  app.route('/', catalogRoutes(guards, { clock, db, signIn: signInMethods(config) }));
  const itemDeps = {
    boss: services.boss,
    crypto: services.crypto,
    registrar: services.registrar,
    appOrigin: config.appOrigin,
  };
  app.route('/', itemsRoutes(guards, itemDeps));
  app.route('/', foundItemsRoutes(guards, itemDeps));
  app.route('/', photosRoutes(guards, { storage: services.storage }));
  app.route('/', notificationsRoutes(guards));
  app.route('/', matchingRoutes(guards));
  app.route('/', claimsRoutes(guards, itemDeps));
  app.route('/', dispatchRoutes(guards, itemDeps));
  app.route('/', auditRoutes(guards));
  app.route('/', supervisionRoutes(guards));
  if (config.devTools && services.devClock)
    app.route('/', devRoutes(guards, { clock: services.devClock, sms: services.sms }));

  app.doc31('/api/openapi.json', API_INFO);

  if (options.webDist) mountSpa(app, options.webDist);

  app.notFound((c) => c.json(toErrorBody(new AppError('not_found')).body, 404));
  app.onError((err, c) => {
    const appError = err instanceof HTTPException ? fromHttpException(err) : err;
    if (!(appError instanceof AppError)) logger.error({ err }, 'Unhandled error');
    const { status, body } = toErrorBody(appError);
    return c.json(body, status as 400);
  });

  return app;
}

/** Hono middleware (csrf, body limit) throws HTTPException; give it our one-sentence messages. */
function fromHttpException(err: HTTPException): AppError {
  if (err.status === 403)
    return new AppError(
      'forbidden',
      'That request came from another site; open Lost & Found directly and try again.',
    );
  if (err.status === 401) return new AppError('unauthenticated');
  if (err.status === 404) return new AppError('not_found');
  if (err.status === 429) return new AppError('rate_limited');
  if (err.status >= 400 && err.status < 500) return new AppError('validation');
  return new AppError('internal', undefined, { cause: err });
}

/**
 * The visitor's address: from the hosting proxy's header when one is configured (it overwrites
 * whatever the visitor sent), else the TCP peer; undefined for in-process requests (tests).
 */
function clientAddress(
  c: Context<AppEnv>,
  header: Services['config']['clientIpHeader'],
): string | undefined {
  if (header) return c.req.header(header)?.split(',')[0]?.trim() || undefined;
  const env = c.env as { incoming?: unknown } | undefined;
  return env?.incoming ? getConnInfo(c).remote.address : undefined;
}

/**
 * A refused SSO sign-in ends on Better-Auth's callback with a JSON error, which a browser would
 * show as raw text. Send people back to the sign-in page with a fixed code instead; the page maps
 * the code to its own message, so nothing from the URL is ever displayed.
 */
function ssoErrorRedirect(path: string, res: Response, appOrigin: string): Response {
  if (!path.startsWith('/api/auth/callback/') || res.status < 400) return res;
  const code = res.status === 403 ? 'sso_refused' : 'sso_failed';
  return new Response(null, {
    status: 302,
    headers: { location: `${appOrigin}/sign-in?error=${code}` },
  });
}

/** Serves the built SPA; any non-API path without a file gets index.html (history routing). */
function mountSpa(app: OpenAPIHono<AppEnv>, webDist: string) {
  const indexFile = path.join(webDist, 'index.html');
  if (!existsSync(indexFile)) return;
  const indexHtml = readFileSync(indexFile, 'utf8');
  const root = path.relative(process.cwd(), webDist);
  app.use(
    '/assets/*',
    serveStatic({
      root,
      onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  );
  app.use('*', serveStatic({ root }));
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml)));
}
