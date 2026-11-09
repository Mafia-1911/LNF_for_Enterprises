// Route building blocks. Every API route is an OpenAPIHono route declared with createRoute, so the
// same Zod schemas validate requests and produce the OpenAPI document (ADR-0001).
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { ValidationFailed } from '../errors';
import type { AppEnv } from './context';

export { createRoute, z } from '@hono/zod-openapi';

/** Field path → first message, e.g. { "timeTo": "Pick a time after the start." }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

/** A router whose validation failures become one-sentence ValidationFailed errors. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) throw new ValidationFailed(fieldErrors(result.error));
    },
  });
}

export type Router = ReturnType<typeof createRouter>;

/** The error body every route documents. */
export const ErrorResponseSchema = z
  .object({
    error: z.object({
      kind: z.enum([
        'validation',
        'unauthenticated',
        'forbidden',
        'not_found',
        'invalid_transition',
        'conflict',
        'rate_limited',
        'unavailable',
        'internal',
      ]),
      message: z.string(),
      fields: z.record(z.string(), z.string()).optional(),
    }),
  })
  .openapi('ErrorResponse');

const errorContent = { 'application/json': { schema: ErrorResponseSchema } };

/** Standard error responses for a route's OpenAPI declaration. */
export const errorResponses = {
  400: { description: 'The request has invalid fields.', content: errorContent },
  401: { description: 'Not signed in.', content: errorContent },
  403: { description: 'Signed in, but not allowed.', content: errorContent },
  404: { description: 'Not found.', content: errorContent },
  409: { description: 'Conflicts with the current state.', content: errorContent },
  429: { description: 'Too many requests.', content: errorContent },
} as const;
