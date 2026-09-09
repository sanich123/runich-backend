export function percentile(sortedSamples: number[], percentileValue: number) {
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sortedSamples.length) - 1);
  return sortedSamples[index] ?? 0;
}
