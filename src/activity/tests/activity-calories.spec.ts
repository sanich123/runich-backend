import { calculateActiveCalories } from '../activity-calories';

describe('calculateActiveCalories', () => {
  it('calculates active calories from weight and activity intensity', () => {
    expect(
      calculateActiveCalories({
        weight: '80',
        height: '180',
        age: '30',
        gender: 'male',
        sport: 'run',
        distance: 10_000,
        duration: 3_600_000,
      }),
    ).toBe(742);
  });

  it('does not calculate calories when a profile metric is absent or invalid', () => {
    const validInput = {
      weight: '80',
      height: '180',
      age: '30',
      gender: 'male',
      sport: 'run',
      distance: 10_000,
      duration: 3_600_000,
    } as const;

    expect(calculateActiveCalories({ ...validInput, weight: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, height: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, age: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, gender: null })).toBeNull();
    expect(calculateActiveCalories({ ...validInput, weight: '301' })).toBeNull();
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
});
