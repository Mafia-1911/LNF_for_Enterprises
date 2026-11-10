// Notifications (FR-09): an in-app alert plus an email, queued in the caller's transaction so a
// rolled-back change never sends anything. SMS is out of scope (cost); visitors get in-app alerts.
import { randomUUID } from 'node:crypto';
import type { Alert, AlertList } from '@lf/contracts';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Forbidden } from '../../platform/errors';
import type { JobSender } from '../../platform/jobs';
import { JOB, type SendEmailData } from '../../platform/jobs/names';
import { countUnread, emailOf, insertAlert, listAlertsFor, markAlertsRead } from './repo';

export type NotificationsDeps = { boss: JobSender; appOrigin: string };

export type AlertKind = Alert['kind'];

/** Visitors sign in by phone; their placeholder address must never be emailed. */
const UNDELIVERABLE = /@visitors\.lostfound\.invalid$/;

export async function sendEmail(
  deps: NotificationsDeps,
  tx: Tx,
  message: { to: string; subject: string; text: string },
): Promise<void> {
  if (UNDELIVERABLE.test(message.to)) return;
  const data: SendEmailData = { tenantId: tx.tenantId, ...message };
  await deps.boss.send(JOB.sendEmail, data, { db: tx.jobs, retryLimit: 5, retryBackoff: true });
}

/** One alert for one member, plus the same message by email. */
export async function notify(
  deps: NotificationsDeps,
  tx: Tx,
  input: { userId: string; kind: AlertKind; title: string; body: string; link: string | null },
): Promise<void> {
  await insertAlert(tx, tx.tenantId, {
    id: randomUUID(),
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    link: input.link,
    createdAt: tx.now,
    readAt: null,
  });
  const to = await emailOf(tx, input.userId);
  if (to) {
    const link = input.link ? `\n\n${deps.appOrigin}${input.link}` : '';
    await sendEmail(deps, tx, {
      to,
      subject: input.title,
      text: `${input.body}${link}\n\nNSU Lost & Found`,
    });
  }
}

export async function listMyAlerts(ctx: RequestCtx): Promise<AlertList> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const rows = await listAlertsFor(tx, tx.tenantId, actor.userId);
      return {
        alerts: rows.map((r) => ({
          id: r.id,
          kind: r.kind as AlertKind,
          title: r.title,
          body: r.body,
          link: r.link,
          createdAt: r.createdAt.toISOString(),
          readAt: r.readAt?.toISOString() ?? null,
        })),
        unread: await countUnread(tx, tx.tenantId, actor.userId),
      };
    },
    { readOnly: true },
  );
}

export async function markMyAlertsRead(ctx: RequestCtx, ids: string[] | undefined): Promise<void> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  await withTx(ctx, (tx) => markAlertsRead(tx, tx.tenantId, actor.userId, ids));
}
