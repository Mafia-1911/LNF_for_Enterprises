// Structured logging (pino). JSON in production, pretty in development, a request id on every
// line logged while handling a request, and a deny-list of fields that are never written out.
import { AsyncLocalStorage } from 'node:async_hooks';
import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

/**
 * Field names that must never reach logs (private details, claim answers, ID numbers, secrets,
 * contact details). Matched at any depth up to 5 levels. Add new sensitive field names here.
 */
export const LOG_DENY_LIST = [
  'note',
  'privateNote',
  'privateDetails',
  'noteCiphertext',
  'answers',
  'univIdNumber',
  'idNumber',
  'nationalId',
  'universityId',
  'proxyIdCiphertext',
  'otp',
  'code',
  'pickupCode',
  'password',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'cookie',
  'authorization',
  'set-cookie',
  'email',
  'phoneNumber',
  'phone',
] as const;

function redactPaths(keys: readonly string[], depth = 5): string[] {
  const paths: string[] = [];
  for (const key of keys) {
    const safe = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
    let prefix = '';
    for (let d = 0; d < depth; d += 1) {
      paths.push(prefix === '' ? safe : `${prefix}${safe.startsWith('[') ? '' : '.'}${safe}`);
      prefix = prefix === '' ? '*' : `${prefix}.*`;
    }
  }
  return paths;
}

type LogContext = { requestId: string };
const logContext = new AsyncLocalStorage<LogContext>();

/** Runs fn with a request id attached to every log line written inside it. */
export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  return logContext.run(ctx, fn);
}

/** `destination` is for tests; by default lines go to stdout. */
export function createLogger(opts: {
  level: string;
  pretty: boolean;
  destination?: NodeJS.WritableStream;
}): Logger {
  const options: LoggerOptions = {
    level: opts.level,
    base: { service: 'lost-and-found' },
    redact: { paths: redactPaths(LOG_DENY_LIST), censor: '[redacted]' },
    mixin() {
      const ctx = logContext.getStore();
      return ctx ? { requestId: ctx.requestId } : {};
    },
  };
  if (opts.pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,service' },
    };
  }
  return opts.destination ? pino(options, opts.destination) : pino(options);
}
