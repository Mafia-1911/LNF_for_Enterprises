// Development only: the /dev/tools page signs in as a seeded account without a code.
// Registered only when ENABLE_DEV_TOOLS=true, which config refuses in production.
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

export function devSignInPlugin(): BetterAuthPlugin {
  return {
    id: 'lf-dev-sign-in',
    endpoints: {
      devSignInAs: createAuthEndpoint(
        '/dev/sign-in-as',
        { method: 'POST', body: z.object({ email: z.string().min(3).max(200) }) },
        async (ctx) => {
          const found = await ctx.context.internalAdapter.findUserByEmail(
            ctx.body.email.toLowerCase(),
          );
          if (!found)
            throw new APIError('NOT_FOUND', {
              message:
                'There is no seeded account with that email; run pnpm db:seed and try again.',
            });
          const session = await ctx.context.internalAdapter.createSession(found.user.id);
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ ok: true });
        },
      ),
    },
  };
}
