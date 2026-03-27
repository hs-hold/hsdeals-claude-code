import { format as dateFnsFormat, isToday, isAfter, subDays, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Jerusalem';

/**
 * Format a date in Israel timezone (Asia/Jerusalem).
 * Drop-in replacement for date-fns format().
 */
export function formatIL(date: Date | string | number, formatStr: string): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const zonedDate = toZonedTime(d, TIMEZONE);
  return dateFnsFormat(zonedDate, formatStr);
}

// Re-export commonly used date-fns utilities
export { isToday, isAfter, subDays, startOfDay };
