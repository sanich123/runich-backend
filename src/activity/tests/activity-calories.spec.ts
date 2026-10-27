import { calculateActiveCalories } from '../services/activity-calories';
import { makeActivityCaloriesInput } from './fixtures';

describe('calculateActiveCalories', () => {
  it('calculates active calories from weight and activity intensity', () => {
    expect(calculateActiveCalories(makeActivityCaloriesInput())).toBe(742);
  });

  it('does not calculate calories when a profile metric is absent or invalid', () => {
    const validInput = makeActivityCaloriesInput();

    expect(calculateActiveCalories({ ...validInput, weight: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, height: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, age: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, gender: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, weight: '301' })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, weight: 'not-a-number' })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, weight: '19' })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, height: '99' })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, age: '101' })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, gender: 'unknown' })).toBeNull();
  });

  it.each([
    ['negative distance', { distance: -1 }],
    ['non-finite distance', { distance: Number.POSITIVE_INFINITY }],
    ['NaN distance', { distance: Number.NaN }],
    ['zero duration', { duration: 0 }],
    ['negative duration', { duration: -1 }],
    ['non-finite duration', { duration: Number.POSITIVE_INFINITY }],
    ['NaN duration', { duration: Number.NaN }],
  ])('returns null for a %s', (_label, override) => {
    expect(
      calculateActiveCalories({
        weight: 80,
        height: 180,
        age: 30,
        gender: 'male',
        sport: 'run',
        distance: 1_000,
        duration: 600_000,
        ...override,
      }),
    ).toBeNull();
  });

  it('supports manual workouts without a distance', () => {
    expect(
      calculateActiveCalories({
        weight: 70,
        height: 175,
        age: 30,
        gender: 'male',
        sport: 'workout',
        distance: 0,
        duration: 3_600_000,
      }),
    ).toBe(275);
  });

  it('uses duration and distance to account for activity intensity', () => {
    const profile = { weight: 70, height: 175, age: 30, gender: 'male' } as const;
    const slowerRun = calculateActiveCalories({ ...profile, sport: 'run', distance: 5_000, duration: 2_400_000 });
    const fasterRun = calculateActiveCalories({ ...profile, sport: 'run', distance: 5_000, duration: 1_800_000 });

    expect(fasterRun).toBeGreaterThan(slowerRun!);
  });

  it.each([
    ['female', 'female'],
    ['Russian male label', ' мужчина '],
    ['Russian female label', 'ЖЕНЩИНА'],
  ])('accepts the %s gender label', (_label, gender) => {
    expect(
      calculateActiveCalories({
        weight: '70',
        height: '175',
        age: '30',
        gender,
        sport: 'workout',
        distance: 0,
        duration: 3_600_000,
      }),
    ).not.toBeNull();
  });

  it.each([
    'бег',
    'walk',
    'ходьба',
    'ride',
    'bike',
    'cycling',
    'велосипед',
    'swim',
    'плавание',
    'hike',
    'trek',
    'поход',
    'yoga',
    'йога',
    'тренировка',
    'unknown sport',
  ])('estimates calories for sport label %s', (sport) => {
    expect(
      calculateActiveCalories({
        weight: 70,
        height: 175,
        age: 30,
        gender: 'male',
        sport,
        distance: 5_000,
        duration: 1_800_000,
      }),
    ).not.toBeNull();
  });

  it.each([
    ['running', [5, 7, 9, 10.5, 12, 13.5, 15]],
    ['walking', [2, 4, 5.3, 6, 7]],
    ['cycling', [10, 17, 20, 23, 30]],
  ])('uses the %s intensity bands', (_sport, speeds) => {
    const sport = _sport === 'running' ? 'run' : _sport === 'walking' ? 'walk' : 'ride';

    for (const speed of speeds) {
      expect(
        calculateActiveCalories({
          weight: 70,
          height: 175,
          age: 30,
          gender: 'male',
          sport,
          distance: 1_000,
          duration: 3_600_000 / speed,
        }),
      ).not.toBeNull();
    }
  });

  it('accepts decimal commas and numeric profile values', () => {
    const decimalComma = calculateActiveCalories({
      weight: '70,5',
      height: '175,5',
      age: '30,5',
      gender: 'male',
      sport: 'run',
      distance: 1_000,
      duration: 600_000,
    });
    const numericValues = calculateActiveCalories({
      weight: 70,
      height: 175,
      age: 30,
      gender: 'male',
      sport: 'run',
      distance: 1_000,
      duration: 600_000,
    });

    expect(decimalComma).not.toBeNull();
    expect(numericValues).not.toBeNull();
  });
});
