// In-app alerts (FR-09). Email copies go out through the notifications module's job.
import { z } from 'zod';

export const ALERT_KINDS = [
  'possible_match',
  'item_arrived',
  'item_not_received',
  'id_card_found',
  'hand_in_reminder',
  'claim_update',
  'general',
] as const;

export const AlertSchema = z
  .object({
    id: z.string(),
    kind: z.enum(ALERT_KINDS),
    title: z.string(),
    body: z.string(),
    /** An in-app path, e.g. /activity or /gallery/FND-2611-0042K. */
    link: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    readAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'Alert' });
export type Alert = z.infer<typeof AlertSchema>;

export const AlertListSchema = z
  .object({ alerts: z.array(AlertSchema), unread: z.number() })
  .meta({ id: 'AlertList' });
export type AlertList = z.infer<typeof AlertListSchema>;

export const MarkAlertsReadSchema = z
  .object({ ids: z.array(z.uuid()).max(100).optional() })
  .meta({ id: 'MarkAlertsRead' });
