// send-email: queued by notify()/sendEmail() inside the business transaction, sent afterwards.
import type { EmailSender } from '../../platform/email';
import type { JobDefinition } from '../../platform/jobs';
import { JOB, type SendEmailData } from '../../platform/jobs/names';
import type { Logger } from '../../platform/logger';

export function notificationsJobs(deps: { email: EmailSender; logger: Logger }): JobDefinition[] {
  const definition: JobDefinition<SendEmailData> = {
    name: JOB.sendEmail,
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
    handler: async (jobs) => {
      for (const job of jobs) {
        await deps.email.send({ to: job.data.to, subject: job.data.subject, text: job.data.text });
        deps.logger.info({ jobId: job.id, tenantId: job.data.tenantId }, 'Sent email');
      }
    },
  };
  return [definition as JobDefinition];
}
