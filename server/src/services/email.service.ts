import { Resend } from 'resend';
import { env } from '../config/env.ts';
import { NotificationRecordModel, type INotificationRecord } from '../modules/users/user.model.ts';

const resendClient = env.resend.isConfigured ? new Resend(env.resend.apiKey) : null;

export async function sendTransactionalEmail(params: {
  userId?: string;
  email: string;
  type: INotificationRecord['type'];
  subject: string;
  html: string;
}): Promise<{ delivered: boolean; status: INotificationRecord['status'] }> {
  if (!resendClient) {
    await NotificationRecordModel.create({
      userId: params.userId || undefined,
      email: params.email,
      type: params.type,
      subject: params.subject,
      status: 'skipped_unconfigured',
      errorMessage: 'RESEND_API_KEY is not configured.',
      attempts: 0,
    });
    return { delivered: false, status: 'skipped_unconfigured' };
  }

  let lastError: string | undefined;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await resendClient.emails.send({
        from: env.resend.emailFrom,
        to: params.email,
        subject: params.subject,
        html: params.html,
      });

      if (response.error) {
        lastError = response.error.message;
        continue;
      }

      await NotificationRecordModel.create({
        userId: params.userId || undefined,
        email: params.email,
        type: params.type,
        subject: params.subject,
        status: 'sent',
        providerMessageId: response.data?.id,
        attempts: attempt,
      });
      return { delivered: true, status: 'sent' };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown email dispatch error';
    }
  }

  await NotificationRecordModel.create({
    userId: params.userId || undefined,
    email: params.email,
    type: params.type,
    subject: params.subject,
    status: 'failed',
    errorMessage: lastError || 'Failed after retries',
    attempts: maxAttempts,
  });

  return { delivered: false, status: 'failed' };
}
