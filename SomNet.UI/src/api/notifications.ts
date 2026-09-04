import type { SubTargetName } from '@/config/sessionUsers';
import type { SessionNotificationForm } from '@/types/notification';
import { toApiDateTimeOffset } from '@/utils/dateTimeLocal';
import { apiFetch } from '@/api/client';

interface SendNotificationResponse {
  message: string;
}

export async function sendSessionNotification(
  domTarget: string,
  subTarget: SubTargetName,
  form: SessionNotificationForm,
): Promise<string> {
  const response = await apiFetch<SendNotificationResponse>('/api/notifications', {
    method: 'POST',
    body: JSON.stringify({
      domTarget,
      subTarget,
      subject: form.subject,
      sessionDateTime: toApiDateTimeOffset(form.sessionDateTime),
      customBody: form.customBody,
    }),
  });

  return response.message;
}
