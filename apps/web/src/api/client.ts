// Typed API client generated from the server's OpenAPI document (pnpm gen:api).
import createClient from 'openapi-fetch';
import type { paths } from './schema';

export const api = createClient<paths>({ baseUrl: '', credentials: 'include' });

type ErrorBody = { error?: { kind?: string; message?: string; fields?: Record<string, string> } };

/** An API error with the one-sentence message to show and any field errors. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: string,
    readonly fields: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const OFFLINE = "We can't reach Lost & Found right now; check your connection and try again.";

/** Returns data or throws ApiError, so React Query sees failures. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch {
    throw new ApiError(OFFLINE, 0, 'unavailable', {});
  }
  if (result.response.ok && result.data !== undefined) return result.data;
  const body = (result.error ?? {}) as ErrorBody;
  throw new ApiError(
    body.error?.message ?? 'Something went wrong on our side; try again in a moment.',
    result.response.status,
    body.error?.kind ?? 'internal',
    body.error?.fields ?? {},
  );
}
