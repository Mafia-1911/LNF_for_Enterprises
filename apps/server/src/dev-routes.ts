// Development and staging only (ENABLE_DEV_TOOLS=true; refused in production):
//   GET  /api/dev/clock            the server's "now" and how far it has been moved
//   POST /api/dev/clock            move it forward ({ advanceMs }) or back to real time ({ reset })
//   GET  /api/dev/sms              messages the DevSmsAdapter "sent" (the /dev/sms page)
import type { AdjustableClock } from './platform/clock';
import type { Guards } from './platform/http/middleware';
import { createRoute, createRouter, z } from './platform/http/router';
import type { SmsSender } from './platform/sms';

const ClockSchema = z
  .object({ now: z.iso.datetime({ offset: true }), offsetMs: z.number() })
  .meta({ id: 'DevClock' });

export function devRoutes(_guards: Guards, deps: { clock: AdjustableClock; sms: SmsSender }) {
  const router = createRouter();
  const clockState = () => ({
    now: deps.clock.now().toISOString(),
    offsetMs: deps.clock.offsetMs(),
  });

  const getClock = createRoute({
    method: 'get',
    path: '/api/dev/clock',
    tags: ['dev'],
    summary: 'Dev only: the server clock',
    responses: {
      200: {
        description: 'Server time.',
        content: { 'application/json': { schema: ClockSchema } },
      },
    },
  });
  router.openapi(getClock, (c) => c.json(clockState(), 200));

  const moveClock = createRoute({
    method: 'post',
    path: '/api/dev/clock',
    tags: ['dev'],
    summary: 'Dev only: move the server clock forward, or reset it',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.union([
              z.object({
                advanceMs: z
                  .number()
                  .int()
                  .positive()
                  .max(366 * 24 * 60 * 60 * 1000),
              }),
              z.object({ reset: z.literal(true) }),
            ]),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Server time after the change.',
        content: { 'application/json': { schema: ClockSchema } },
      },
    },
  });
  router.openapi(moveClock, (c) => {
    const body = c.req.valid('json');
    if ('reset' in body) deps.clock.reset();
    else deps.clock.advance(body.advanceMs);
    return c.json(clockState(), 200);
  });

  const sms = createRoute({
    method: 'get',
    path: '/api/dev/sms',
    tags: ['dev'],
    summary: 'Dev only: text messages the dev SMS adapter would have sent',
    responses: {
      200: {
        description: 'Newest first.',
        content: {
          'application/json': {
            schema: z.object({
              messages: z.array(
                z.object({
                  to: z.string(),
                  body: z.string(),
                  at: z.iso.datetime({ offset: true }),
                }),
              ),
            }),
          },
        },
      },
    },
  });
  router.openapi(sms, (c) => c.json({ messages: deps.sms.recent?.() ?? [] }, 200));

  return router;
}
