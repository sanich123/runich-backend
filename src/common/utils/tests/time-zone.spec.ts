import {
  getLocalMonthRange,
  getLocalWeekRange,
  getLocalYearRange,
  localDateToUtc,
  startOfLocalWeek,
} from '../time-zone';

describe('time zone calendar calculations', () => {
  it('converts local midnight to the correct UTC instant', () => {
    expect(localDateToUtc({ year: 2026, month: 1, day: 1 }, 'UTC').toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(localDateToUtc({ year: 2026, month: 1, day: 1 }, 'Europe/Moscow').toISOString()).toBe(
      '2025-12-31T21:00:00.000Z',
    );
    expect(localDateToUtc({ year: 2026, month: 1, day: 1 }, 'America/New_York').toISOString()).toBe(
      '2026-01-01T05:00:00.000Z',
    );
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
});
