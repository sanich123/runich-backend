import { generateActivityTitle } from '../activity-title';
import { jest } from '@jest/globals';

describe('generateActivityTitle', () => {
  it.each([
    ['2026-08-12T01:00:00', 'run', 'Ночной бег'],
    ['2026-08-12T06:00:00', 'walk', 'Утренняя ходьба'],
    ['2026-08-12T12:00:00', 'swim', 'Дневное плавание'],
    ['2026-08-12T18:00:00', 'ride', 'Вечерний велозаезд'],
  ])('creates a title for %s and %s', (date, sport, expectedTitle) => {
    expect(generateActivityTitle(sport, date)).toBe(expectedTitle);
  });

  it('uses a generic training name for an unknown sport', () => {
    expect(generateActivityTitle('unknown', '2026-08-12T09:00:00')).toBe('Утренняя тренировка');
  });

  it('uses the supplied IANA time zone instead of the backend process time zone', () => {
    expect(generateActivityTitle('run', '2026-08-12T03:30:00.000Z', 'Europe/Moscow')).toBe('Утренний бег');
    expect(generateActivityTitle('run', '2026-08-12T05:30:00.000Z', 'America/New_York')).toBe('Ночной бег');
  });

  it.each([
    ['йога', 'Ночная йога'],
    ['hike', 'Ночной поход'],
    ['лыжи', 'Ночная лыжная прогулка'],
  ])('uses the localized name for %s', (sport, expectedTitle) => {
    expect(generateActivityTitle(sport, '2026-08-12T01:00:00Z', 'UTC')).toBe(expectedTitle);
  });

  it('accepts Date objects and uses the current hour for missing or invalid dates', () => {
    expect(generateActivityTitle('walk', new Date('2026-08-12T06:00:00.000Z'), 'UTC')).toBe('Утренняя ходьба');

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-12T18:30:00.000Z'));
    try {
      expect(generateActivityTitle('run', undefined, 'UTC')).toBe('Вечерний бег');
      expect(generateActivityTitle('run', 'not-a-date', 'UTC')).toBe('Вечерний бег');
    } finally {
      jest.useRealTimers();
    }
  });
});
