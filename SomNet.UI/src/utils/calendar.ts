const pad = (value: number) => String(value).padStart(2, '0');

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export function compareDateKeys(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function isSameDateKey(a: string, b: string): boolean {
  return a === b;
}

export function isDateKeyInRange(key: string, fromDate: string, toDate: string): boolean {
  if (fromDate && compareDateKeys(key, fromDate) < 0) {
    return false;
  }
  if (toDate && compareDateKeys(key, toDate) > 0) {
    return false;
  }
  return true;
}

export function isDateKeyBetween(key: string, fromDate: string, toDate: string): boolean {
  if (!fromDate || !toDate) {
    return false;
  }
  const [start, end] =
    compareDateKeys(fromDate, toDate) <= 0 ? [fromDate, toDate] : [toDate, fromDate];
  return compareDateKeys(key, start) >= 0 && compareDateKeys(key, end) <= 0;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
}

export interface CalendarDay {
  key: string;
  inCurrentMonth: boolean;
}

export function getMonthGrid(year: number, month: number): CalendarDay[] {
  const firstOfMonth = new Date(year, month, 1, 12);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset, 12);
  const days: CalendarDay[] = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
      12,
    );
    days.push({
      key: toDateKey(date),
      inCurrentMonth: date.getMonth() === month,
    });
  }

  return days;
}

export function normalizeDateRange(fromDate: string, toDate: string): {
  fromDate: string;
  toDate: string;
} {
  if (fromDate && toDate && compareDateKeys(fromDate, toDate) > 0) {
    return { fromDate: toDate, toDate: fromDate };
  }
  return { fromDate, toDate };
}
