// Better-Auth browser client: SSO (generic OIDC registered as a social provider), email codes and
// phone codes. Error messages are mapped to one sentence each (no codes on screen).
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, phoneNumberClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [emailOTPClient(), phoneNumberClient()],
});

export const SSO_PROVIDER = 'nsu-sso';

const MESSAGES: Record<string, string> = {
  INVALID_OTP: "That code isn't right; check the latest message and try again.",
  OTP_EXPIRED: 'That code has expired; ask for a new one.',
  TOO_MANY_ATTEMPTS: 'Too many wrong codes; ask for a new one.',
  INVALID_PHONE_NUMBER: 'Enter a Bangladesh mobile number, e.g. 01712 345678.',
};

/** One sentence for any Better-Auth error: our policy messages pass through, codes are mapped. */
export function authErrorMessage(
  error:
    { status?: number; code?: string | undefined; message?: string | undefined } | null | undefined,
): string {
  if (!error) return 'Something went wrong; try again.';
  if (error.status === 429)
    return 'Too many attempts in a short time; wait a minute and try again.';
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code] ?? '';
  if (error.status === 403 && error.message) return error.message;
  return "Signing in didn't work; check your details and try again.";
}
