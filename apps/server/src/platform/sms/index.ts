// SMS adapter (ADR-0009). Only the dev adapter exists in this phase: it logs the message and keeps
// the last 50 for the dev-only /dev/sms page. config refuses SMS_PROVIDER=dev in production.
import type { Clock } from '../clock';
import type { Logger } from '../logger';

export type SmsMessage = { to: string; body: string; at: string };

export type SmsSender = {
  send(to: string, body: string): Promise<void>;
  /** Dev adapter only: messages sent so far, newest first. */
  readonly recent?: () => SmsMessage[];
};

export function createDevSmsAdapter(logger: Logger, clock: Clock): SmsSender {
  const messages: SmsMessage[] = [];
  return {
    send(to, body) {
      messages.unshift({ to, body, at: clock.now().toISOString() });
      messages.length = Math.min(messages.length, 50);
      // Dev only: the message (with its code) is logged on purpose so it can be read locally.
      logger.warn(
        { smsTo: to, smsBody: body },
        'Dev SMS adapter: message not sent, shown at /dev/sms',
      );
      return Promise.resolve();
    },
    recent: () => [...messages],
  };
}
