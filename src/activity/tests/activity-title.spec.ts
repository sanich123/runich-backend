import { generateActivityTitle } from '../activity-title';

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
});
