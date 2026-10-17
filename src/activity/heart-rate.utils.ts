import type { ActivityHeartRateSampleObject } from './activity.dto';

export function getHeartRateStatistics(samples: readonly ActivityHeartRateSampleObject[]) {
  if (samples.length === 0) {
    return { averageHeartRate: null, minHeartRate: null, maxHeartRate: null };
  }

  const values = samples.map(({ beatsPerMinute }) => beatsPerMinute);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    averageHeartRate: Math.round(sum / values.length),
    minHeartRate: Math.min(...values),
    maxHeartRate: Math.max(...values),
  };
}
