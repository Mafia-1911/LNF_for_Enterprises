// Email adapter (ADR-0009): SMTP (Mailpit locally, any provider later) or an in-memory outbox for tests.
import nodemailer from 'nodemailer';
import type { Config } from '../config';

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export type EmailSender = {
  send(message: EmailMessage): Promise<void>;
  /** Present only on the memory transport, for tests. */
  readonly outbox?: EmailMessage[];
};

export function createEmailSender(config: Config['email']): EmailSender {
  if (config.transport === 'memory') {
    const outbox: EmailMessage[] = [];
    return {
      outbox,
      send: (message) => {
        outbox.push(message);
        return Promise.resolve();
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
  };
}
