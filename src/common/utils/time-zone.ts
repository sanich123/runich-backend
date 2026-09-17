function getRuntimeTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const DEFAULT_TIME_ZONE = getRuntimeTimeZone();

export type LocalDate = {
  year: number;
  month: number;
  day: number;
};

export type LocalDateTime = LocalDate & {
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  const cachedFormatter = formatters.get(timeZone);
  if (cachedFormatter) return cachedFormatter;

  const formatter = new Intl.DateTimeFormat('en-US', {
    calendar: 'gregory',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    numberingSystem: 'latn',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100) return false;

  try {
    getFormatter(value).format();
    return true;
  } catch {
    return false;
  }
}

function getNumericParts(date: Date, timeZone: string): Record<string, number> {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');

  return getFormatter(timeZone)
    .formatToParts(date)
    .reduce<Record<string, number>>((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = Number(part.value);
      return parts;
    }, {});
}

export function getLocalDateTimeParts(date: Date, timeZone = DEFAULT_TIME_ZONE): LocalDateTime {
  const parts = getNumericParts(date, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function getLocalDateParts(date: Date, timeZone = DEFAULT_TIME_ZONE): LocalDate {
  const { year, month, day } = getLocalDateTimeParts(date, timeZone);
  return { year, month, day };
}

function toUtcWallClockTimestamp(date: LocalDateTime): number {
  const utcDate = new Date(0);
  utcDate.setUTCFullYear(date.year, date.month - 1, date.day);
  utcDate.setUTCHours(date.hour, date.minute, date.second, 0);
  return utcDate.getTime();
}

function isValidCalendarDate(date: LocalDate) {
  const timestamp = toUtcWallClockTimestamp({ ...date, hour: 0, minute: 0, second: 0 });
  const normalizedDate = new Date(timestamp);
  return (
    normalizedDate.getUTCFullYear() === date.year &&
    normalizedDate.getUTCMonth() + 1 === date.month &&
    normalizedDate.getUTCDate() === date.day
  );
}

export function localDateToUtc(date: LocalDate, timeZone = DEFAULT_TIME_ZONE): Date {
  if (!isValidCalendarDate(date)) throw new RangeError('Invalid calendar date');

  const localWallClockTimestamp = toUtcWallClockTimestamp({ ...date, hour: 0, minute: 0, second: 0 });
  let candidateTimestamp = localWallClockTimestamp;

  // Recalculate the offset after each adjustment so boundaries crossing DST
  // transitions use the offset that is valid at that local midnight.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actualLocalDateTime = getLocalDateTimeParts(new Date(candidateTimestamp), timeZone);
    const representedWallClockTimestamp = toUtcWallClockTimestamp(actualLocalDateTime);
    const offset = representedWallClockTimestamp - candidateTimestamp;
    const adjustedTimestamp = localWallClockTimestamp - offset;
    if (adjustedTimestamp === candidateTimestamp) return new Date(candidateTimestamp);
    candidateTimestamp = adjustedTimestamp;
  }

  return new Date(candidateTimestamp);
}

export function addCalendarDays(date: LocalDate, days: number): LocalDate {
  const utcDate = new Date(0);
  utcDate.setUTCFullYear(date.year, date.month - 1, date.day + days);
  utcDate.setUTCHours(0, 0, 0, 0);
  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  };
}

export function startOfLocalWeek(date: LocalDate): LocalDate {
  const utcDate = new Date(0);
  utcDate.setUTCFullYear(date.year, date.month - 1, date.day);
  utcDate.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (utcDate.getUTCDay() + 6) % 7;
  return addCalendarDays(date, -daysSinceMonday);
}

export function parseLocalCalendarDate(value: string, timeZone = DEFAULT_TIME_ZONE): LocalDate {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const date = {
      year: Number(dateOnlyMatch[1]),
      month: Number(dateOnlyMatch[2]),
      day: Number(dateOnlyMatch[3]),
    };
    if (!isValidCalendarDate(date)) throw new RangeError('Invalid calendar date');
    return date;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) throw new RangeError('Invalid date');

  // Legacy clients sent timezone-less strings such as "Mon Aug 10 2026".
  // Keep their calendar date intact while new clients send YYYY-MM-DD.
  const hasExplicitOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  if (!hasExplicitOffset) {
    return {
      year: parsedDate.getUTCFullYear(),
      month: parsedDate.getUTCMonth() + 1,
      day: parsedDate.getUTCDate(),
    };
  }

  return getLocalDateParts(parsedDate, timeZone);
}

export function getLocalMonthRange(year: number, monthIndex: number, timeZone = DEFAULT_TIME_ZONE) {
  const start = { year, month: monthIndex + 1, day: 1 };
  const nextMonth = monthIndex === 11 ? { year: year + 1, month: 1, day: 1 } : { year, month: monthIndex + 2, day: 1 };
  return { gte: localDateToUtc(start, timeZone), lt: localDateToUtc(nextMonth, timeZone) };
}

export function getLocalYearRange(year: number, timeZone = DEFAULT_TIME_ZONE) {
  return {
    gte: localDateToUtc({ year, month: 1, day: 1 }, timeZone),
    lt: localDateToUtc({ year: year + 1, month: 1, day: 1 }, timeZone),
  };
}

export function getLocalWeekRange(firstDay: string | undefined, timeZone = DEFAULT_TIME_ZONE) {
  const firstDate = firstDay ? parseLocalCalendarDate(firstDay, timeZone) : getLocalDateParts(new Date(), timeZone);
  const monday = startOfLocalWeek(firstDate);
  const nextMonday = addCalendarDays(monday, 7);
  return { gte: localDateToUtc(monday, timeZone), lt: localDateToUtc(nextMonday, timeZone) };
}
