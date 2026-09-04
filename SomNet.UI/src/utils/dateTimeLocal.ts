export function normalizeDateTimeLocal(value: string): string {
  if (!value) {
    return '';
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match ? match[1] : value;
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function createDefaultSessionDateTime(): string {
  return toDateTimeLocalValue(new Date());
}

export function formatSessionDateTimeDisplay(sessionDateTime: string): string {
  if (!sessionDateTime) {
    return 'Date and time not set';
  }

  const parsed = new Date(sessionDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date and time not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(parsed);
}

export function formatDateOnlyDisplay(dateValue: string): string {
  if (!dateValue) {
    return '';
  }

  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(parsed);
}

export function formatDateRangeDisplay(fromDate: string, toDate: string): string {
  if (fromDate && toDate) {
    return `${formatDateOnlyDisplay(fromDate)} – ${formatDateOnlyDisplay(toDate)}`;
  }
  if (fromDate) {
    return `From ${formatDateOnlyDisplay(fromDate)}`;
  }
  if (toDate) {
    return `Through ${formatDateOnlyDisplay(toDate)}`;
  }
  return 'All dates';
}
