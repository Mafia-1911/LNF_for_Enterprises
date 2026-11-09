import { describe, expect, it } from 'vitest';
import {
  AppError,
  Conflict,
  Forbidden,
  InvalidTransition,
  NotFound,
  RateLimited,
  toErrorBody,
  Unauthenticated,
  Unavailable,
  ValidationFailed,
  type ErrorKind,
} from './index';

const KINDS: ErrorKind[] = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'invalid_transition',
  'conflict',
  'rate_limited',
  'unavailable',
  'internal',
];

describe('errors', () => {
  it.each(KINDS)(
    'has a one-sentence default message for %s (what happened; what to do next)',
    (kind) => {
      const message = new AppError(kind).userMessage;
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message.slice(0, -1)).not.toMatch(/[.!?]\s/); // a single sentence
      expect(message).toContain(';');
      expect(message).not.toMatch(/\b(error|code)\s*\d+/i);
    },
  );

  it('maps each typed error to its HTTP status', () => {
    expect(
      [
        new ValidationFailed({ a: 'x' }),
        new Unauthenticated(),
        new Forbidden(),
        new NotFound(),
        new InvalidTransition(),
        new Conflict(),
        new RateLimited(),
        new Unavailable(),
      ].map((e) => e.status),
    ).toEqual([400, 401, 403, 404, 409, 409, 429, 503]);
  });

  it('includes field errors for validation', () => {
    expect(toErrorBody(new ValidationFailed({ timeTo: 'Pick a later time.' }))).toEqual({
      status: 400,
      body: {
        error: {
          kind: 'validation',
          message: 'Some details need fixing; check the highlighted fields and try again.',
          fields: { timeTo: 'Pick a later time.' },
        },
      },
    });
  });

  it('never leaks the message of an unexpected error', () => {
    const { status, body } = toErrorBody(new Error('relation "users" does not exist'));
    expect(status).toBe(500);
    expect(body.error.message).not.toContain('relation');
    expect(body.error.kind).toBe('internal');
  });

  it('keeps a custom message', () => {
    expect(
      toErrorBody(new NotFound("We couldn't find that report; check the ID and try again.")).body
        .error.message,
    ).toBe("We couldn't find that report; check the ID and try again.");
  });
});
