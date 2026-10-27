import {
  DEFAULT_TIME_ZONE,
  getLocalDateParts,
  getLocalDateTimeParts,
  getLocalMonthRange,
  getLocalWeekRange,
  getLocalYearRange,
  isValidIanaTimeZone,
  localDateToUtc,
  startOfLocalWeek,
} from '../time-zone';

const januaryFirst = { year: 2026, month: 1, day: 1 };

describe('time zone calendar calculations', () => {
  it('converts local midnight to the correct UTC instant', () => {
    expect(localDateToUtc(januaryFirst, 'UTC').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(localDateToUtc(januaryFirst, 'Europe/Moscow').toISOString()).toBe('2025-12-31T21:00:00.000Z');
    expect(localDateToUtc(januaryFirst, 'America/New_York').toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });

  it('keeps month and year ranges aligned to the users local calendar', () => {
    const moscowMonth = getLocalMonthRange(2026, 0, 'Europe/Moscow');
    expect(moscowMonth.gte.toISOString()).toBe('2025-12-31T21:00:00.000Z');
    expect(moscowMonth.lt.toISOString()).toBe('2026-01-31T21:00:00.000Z');

    const newYorkYear = getLocalYearRange(2026, 'America/New_York');
    expect(newYorkYear.gte.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(newYorkYear.lt.toISOString()).toBe('2027-01-01T05:00:00.000Z');

    const kiritimatiMonth = getLocalMonthRange(2026, 0, 'Pacific/Kiritimati');
    expect(kiritimatiMonth.gte.toISOString()).toBe('2025-12-31T10:00:00.000Z');
    expect(kiritimatiMonth.lt.toISOString()).toBe('2026-01-31T10:00:00.000Z');

    const utcYear = getLocalYearRange(2026, 'UTC');
    expect(utcYear.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(utcYear.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('uses Monday as the first day and applies DST at the next boundary', () => {
    expect(startOfLocalWeek({ year: 2026, month: 3, day: 8 })).toEqual({ year: 2026, month: 3, day: 2 });
    const week = getLocalWeekRange('2026-03-08', 'America/New_York');
    expect(week.gte.toISOString()).toBe('2026-03-02T05:00:00.000Z');
    expect(week.lt.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('validates IANA names and rejects empty, oversized, and invalid inputs', () => {
    expect(isValidIanaTimeZone('Europe/Moscow')).toBe(true);
    expect(isValidIanaTimeZone('')).toBe(false);
    expect(isValidIanaTimeZone('X'.repeat(101))).toBe(false);
    expect(isValidIanaTimeZone(42)).toBe(false);
    expect(isValidIanaTimeZone('Invalid/Zone')).toBe(false);
  });

  it('returns local date parts with and without an explicit time zone', () => {
    const date = new Date('2026-08-12T03:04:05.000Z');

    expect(getLocalDateTimeParts(date, 'UTC')).toEqual({
      year: 2026,
      month: 8,
      day: 12,
      hour: 3,
      minute: 4,
      second: 5,
    });
    expect(getLocalDateParts(date, 'UTC')).toEqual({ year: 2026, month: 8, day: 12 });
    expect(getLocalDateTimeParts(date)).toEqual(expect.objectContaining({ year: 2026, month: 8, day: 12 }));
    expect(getLocalDateParts(date)).toEqual(getLocalDateParts(date, DEFAULT_TIME_ZONE));
    expect(() => getLocalDateTimeParts(new Date('invalid'), 'UTC')).toThrow(RangeError);
  });

  it('rejects impossible dates and parses date-only, legacy, and offset timestamps', () => {
    expect(() => localDateToUtc({ year: 2026, month: 2, day: 30 }, 'UTC')).toThrow('Invalid calendar date');
    expect(() => getLocalWeekRange('2026-02-30', 'UTC')).toThrow('Invalid calendar date');
    expect(getLocalWeekRange('2026-08-10', 'UTC').gte.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(getLocalWeekRange('Mon Aug 10 2026 GMT', 'UTC').gte.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    expect(getLocalWeekRange('2026-03-09T01:00:00Z', 'America/New_York').gte.toISOString()).toBe(
      '2026-03-02T05:00:00.000Z',
    );
    expect(() => getLocalWeekRange('not-a-date', 'UTC')).toThrow('Invalid date');
  });

  it('uses the current local date when no week start is supplied and rolls December into January', () => {
    const currentWeek = getLocalWeekRange(undefined, 'UTC');
    expect(currentWeek.gte.getUTCDay()).toBe(1);
    expect(currentWeek.lt.getTime() - currentWeek.gte.getTime()).toBe(7 * 24 * 60 * 60 * 1_000);

    const december = getLocalMonthRange(2026, 11, 'UTC');
    expect(december.gte.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(december.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(getLocalYearRange(2026).gte).toBeInstanceOf(Date);
    expect(getLocalWeekRange(undefined).gte).toBeInstanceOf(Date);
    expect(localDateToUtc(januaryFirst)).toBeInstanceOf(Date);
    expect(getLocalMonthRange(2026, 0).gte).toBeInstanceOf(Date);
  });
});
