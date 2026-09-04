import { createDefaultSessionDateTime, formatSessionDateTimeDisplay } from '@/utils/dateTimeLocal';

export const DEFAULT_NOTIFICATION_SUBJECT = 'Upcoming Session';

export const STANDARD_NOTIFICATION_INTRO =
  'You have an upcoming SomNet session scheduled. Please be ready at the date and time shown below.';

export interface SessionNotificationForm {
  subject: string;
  sessionDateTime: string;
  customBody: string;
}

export function createDefaultNotificationForm(): SessionNotificationForm {
  return {
    subject: DEFAULT_NOTIFICATION_SUBJECT,
    sessionDateTime: createDefaultSessionDateTime(),
    customBody: '',
  };
}

export function buildNotificationPreview(
  form: SessionNotificationForm,
  subName: string,
  domName: string,
): string {
  const formattedDateTime = formatSessionDateTimeDisplay(form.sessionDateTime);
  const lines = [
    `To: ${subName}`,
    `Subject: ${form.subject}`,
    '',
    STANDARD_NOTIFICATION_INTRO,
    '',
    `Scheduled: ${formattedDateTime}`,
  ];

  if (form.customBody.trim()) {
    lines.push('', form.customBody.trim());
  }

  lines.push('', `— ${domName}`);
  return lines.join('\n');
}
