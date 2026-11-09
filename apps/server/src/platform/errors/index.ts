// Typed errors. Every error a person can see is one sentence: what happened and what to do next.
// No error codes on screen; `kind` is for client logic only (for example, redirect to sign-in).

export type ErrorKind =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_transition'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'internal';

const STATUS: Record<ErrorKind, 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_transition: 409,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ErrorKind, string> = {
  validation: 'Some details need fixing; check the highlighted fields and try again.',
  unauthenticated: 'You are signed out; sign in again to continue.',
  forbidden: "Your account can't do that; ask the Lost & Found office if you think this is wrong.",
  not_found: "We couldn't find that; check the link or ID and try again.",
  invalid_transition:
    'That step no longer applies because the record changed; refresh the page to see its current status.',
  conflict: 'Someone else changed this at the same time; refresh the page and try again.',
  rate_limited: 'Too many attempts in a short time; wait a minute and try again.',
  unavailable: 'The service is busy or offline; try again in a few minutes.',
  internal:
    'Something went wrong on our side; try again, and contact the Lost & Found office if it keeps happening.',
};

export type FieldErrors = Record<string, string>;

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly status: (typeof STATUS)[ErrorKind];
  /** One sentence shown to people. */
  readonly userMessage: string;
  readonly fields: FieldErrors | undefined;

  constructor(
    kind: ErrorKind,
    userMessage?: string,
    opts?: { fields?: FieldErrors; cause?: unknown },
  ) {
    super(
      userMessage ?? DEFAULT_MESSAGE[kind],
      opts?.cause === undefined ? undefined : { cause: opts.cause },
    );
    this.name = 'AppError';
    this.kind = kind;
    this.status = STATUS[kind];
    this.userMessage = userMessage ?? DEFAULT_MESSAGE[kind];
    this.fields = opts?.fields;
  }
}

export class ValidationFailed extends AppError {
  constructor(fields: FieldErrors, message?: string) {
    super('validation', message, { fields });
  }
}
export class Unauthenticated extends AppError {
  constructor(message?: string) {
    super('unauthenticated', message);
  }
}
export class Forbidden extends AppError {
  constructor(message?: string) {
    super('forbidden', message);
  }
}
export class NotFound extends AppError {
  constructor(message?: string) {
    super('not_found', message);
  }
}
export class InvalidTransition extends AppError {
  constructor(message?: string) {
    super('invalid_transition', message);
  }
}
export class Conflict extends AppError {
  constructor(message?: string) {
    super('conflict', message);
  }
}
export class RateLimited extends AppError {
  constructor(message?: string) {
    super('rate_limited', message);
  }
}
export class Unavailable extends AppError {
  constructor(message?: string, cause?: unknown) {
    super('unavailable', message, { cause });
  }
}

export type ErrorBody = { error: { kind: ErrorKind; message: string; fields?: FieldErrors } };

/** Turns anything thrown into a safe response body. Unknown errors never leak details. */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  const appError = err instanceof AppError ? err : new AppError('internal');
  const body: ErrorBody = { error: { kind: appError.kind, message: appError.userMessage } };
  if (appError.fields) body.error.fields = appError.fields;
  return { status: appError.status, body };
}
