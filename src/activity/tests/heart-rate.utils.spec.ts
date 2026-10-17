import { getHeartRateStatistics } from '../heart-rate.utils';

describe('getHeartRateStatistics', () => {
  it('returns empty statistics when there are no heart rate samples', () => {
    expect(getHeartRateStatistics([])).toEqual({
      averageHeartRate: null,
      minHeartRate: null,
      maxHeartRate: null,
    });
  });

  it('calculates the rounded average and range for recorded samples', () => {
    expect(
      getHeartRateStatistics([
        { timestamp: 1, beatsPerMinute: 72 },
        { timestamp: 2, beatsPerMinute: 89 },
        { timestamp: 3, beatsPerMinute: 84 },
      ]),
    ).toEqual({ averageHeartRate: 82, minHeartRate: 72, maxHeartRate: 89 });
  });
});
