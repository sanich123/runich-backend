import {
  getElevationGainFromKilometreSplits,
  getElevationGainFromLocations,
  createActivityChartLocations,
  hidePendingActivityMediaForViewer,
  normalizeActivityCard,
  normalizeActivityCardForViewer,
  normalizeActivityDetails,
  omitMediaProcessingStatus,
  reduceActivityChartHeartRateSamples,
} from '../utils';
import { makeActivityRouteCoordinate, makeApprovedActivityMedia, makeQueuedActivity } from './fixtures';

describe('activity utilities', () => {
  it('removes media processing status only from object values', () => {
    expect(omitMediaProcessingStatus(null)).toBeNull();
    expect(omitMediaProcessingStatus('queued')).toBe('queued');
    expect(omitMediaProcessingStatus(['queued'])).toEqual(['queued']);
    expect(omitMediaProcessingStatus(makeQueuedActivity())).toEqual({
      id: 'activity-1',
    });
  });

  it('calculates positive elevation from kilometre splits and ignores invalid values', () => {
    expect(getElevationGainFromKilometreSplits(undefined)).toBe(0);
    expect(
      getElevationGainFromKilometreSplits([
        null,
        {},
        { lastKilometerAltitude: '120' },
        { lastKilometerAltitude: Number.NaN },
        { lastKilometerAltitude: -4 },
        { lastKilometerAltitude: 12 },
      ]),
    ).toBe(12);
  });

  it('filters unreliable locations before calculating elevation', () => {
    const invalidLocations = [
      null,
      'invalid',
      { coords: {} },
      { coords: { altitude: Number.NaN } },
      { coords: { altitude: 100, altitudeAccuracy: -1 } },
      { coords: { altitude: 100, altitudeAccuracy: 16 } },
      { coords: { altitude: 100, altitudeAccuracy: '16' } },
      { coords: { altitude: 100 }, mocked: true },
      { coords: { altitude: 100, mocked: true } },
    ];

    expect(getElevationGainFromLocations([...invalidLocations, { coords: { altitude: 100 } }])).toBe(0);
    expect(getElevationGainFromLocations([{ coords: { altitude: 100 } }])).toBe(0);
    expect(getElevationGainFromLocations(undefined)).toBe(0);
  });

  it('calculates a smoothed climb and ignores implausible vertical speed', () => {
    const climb = [100, 110, 120, 120, 116, 116].map((altitude, index) => ({
      timestamp: index * 2_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(climb)).toBe(10);

    const gradualDescent = [100, 110, 120, 120, 118, 118].map((altitude, index) => ({
      timestamp: index * 2_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(gradualDescent)).toBe(10);

    const implausibleClimb = [100, 110, 120, 120, 100, 100].map((altitude, index) => ({
      timestamp: index * 1_000,
      coords: { altitude },
    }));
    expect(getElevationGainFromLocations(implausibleClimb)).toBe(0);

    const noTimestampClimb = [100, 110, 120, 120, 100, 100].map((altitude) => ({ coords: { altitude } }));
    expect(getElevationGainFromLocations(noTimestampClimb)).toBe(20);
  });

  it('hides restricted card elevation from other viewers but keeps it for the owner', () => {
    const activity = {
      id: 'activity-1',
      userId: 'owner-1',
      elevationGain: 40,
      profile: { allowActivityElevationViewing: false },
    };

    expect(normalizeActivityCardForViewer(activity, 'viewer-1')).toMatchObject({ elevationGain: null });
    expect(normalizeActivityCardForViewer(activity, 'owner-1')).toMatchObject({ elevationGain: 40 });
    expect(normalizeActivityCardForViewer(activity)).toMatchObject({ elevationGain: null });
    expect(
      normalizeActivityCardForViewer({ ...activity, profile: { allowActivityElevationViewing: true } }, 'viewer-1'),
    ).toMatchObject({ elevationGain: 40 });
  });

  it('shows blurhash-only pending media to others and full moderation state to its owner', () => {
    const activity = {
      id: 'activity-1',
      userId: 'owner-1',
      media: [
        null,
        'invalid',
        {
          id: 'queued',
          url: 'https://quarantine.example/photo.jpg',
          thumbnail: 'https://quarantine.example/thumbnail.jpg',
          blurhash: 'blurhash-queued',
          mediaReviewStatus: 'queued',
          mediaModerationAssetId: 'asset-queued',
          thumbnailModerationAssetId: 'asset-thumbnail',
        },
        makeApprovedActivityMedia(),
        { id: 'legacy', url: 'https://cdn.example/legacy.jpg' },
        { id: 'rejected', url: null, mediaReviewStatus: 'rejected' },
        { id: 'failed', url: null, mediaReviewStatus: 'failed' },
        { id: 'without-status', url: null },
      ],
    };

    expect(hidePendingActivityMediaForViewer(activity, 'viewer-1')).toEqual({
      ...activity,
      media: [
        {
          id: 'queued',
          url: null,
          thumbnail: null,
          blurhash: 'blurhash-queued',
          mediaReviewStatus: 'queued',
        },
        makeApprovedActivityMedia(),
        { id: 'legacy', url: 'https://cdn.example/legacy.jpg' },
      ],
    });
    expect(hidePendingActivityMediaForViewer(activity, 'owner-1').media).toEqual([
      {
        id: 'queued',
        url: 'https://quarantine.example/photo.jpg',
        thumbnail: 'https://quarantine.example/thumbnail.jpg',
        blurhash: 'blurhash-queued',
        mediaReviewStatus: 'queued',
      },
      makeApprovedActivityMedia(),
      { id: 'legacy', url: 'https://cdn.example/legacy.jpg' },
      { id: 'rejected', url: null, mediaReviewStatus: 'rejected' },
      { id: 'failed', url: null, mediaReviewStatus: 'failed' },
      { id: 'without-status', url: null },
    ]);
    const withoutMedia = { ...activity, media: undefined };
    expect(hidePendingActivityMediaForViewer(withoutMedia)).toBe(withoutMedia);
  });

  it('creates privacy-filtered chart samples without exposing route coordinates', () => {
    const locations = [
      { timestamp: 1_000, coords: makeActivityRouteCoordinate() },
      { timestamp: 61_000, coords: { latitude: 0, longitude: 0.001, altitude: 110, timestamp: 61_000 } },
    ];

    const samples = createActivityChartLocations(locations, 111, true, true);

    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual({ timestamp: 1_000, coords: { altitude: 100, timestamp: 1_000 } });
    expect(samples[1]?.coords).toEqual(
      expect.objectContaining({ altitude: 110, timestamp: 61_000, speed: expect.any(Number) }),
    );
    expect(samples[1]?.coords.speed).toBeGreaterThan(0);
    expect(samples[0]?.coords).not.toHaveProperty('latitude');
    expect(samples[0]?.coords).not.toHaveProperty('longitude');
    expect(createActivityChartLocations(locations, 111, false, true)[1]?.coords).toEqual({
      altitude: 110,
      timestamp: 61_000,
    });
    expect(createActivityChartLocations(locations, 111, true, false)[0]?.coords).toEqual({ timestamp: 1_000 });

    const fallbackTimestampLocations = [
      { coords: makeActivityRouteCoordinate() },
      { timestamp: 61_000, coords: { latitude: 0, longitude: 0.001, altitude: 110 } },
      { timestamp: 0, coords: { latitude: 0, longitude: 0.002, altitude: 120 } },
      { coords: { latitude: 0, longitude: 0.003, altitude: 130 } },
    ];
    const fallbackTimestampSamples = createActivityChartLocations(fallbackTimestampLocations, 0, true, true);
    expect(fallbackTimestampSamples).toHaveLength(2);
    expect(fallbackTimestampSamples[0]?.timestamp).toBe(1_000);
    expect(fallbackTimestampSamples[1]?.timestamp).toBe(61_000);
    expect(fallbackTimestampSamples[1]?.coords).not.toHaveProperty('timestamp');
  });

  it('filters, sorts, and aligns heart-rate samples to the activity route', () => {
    const samples = [
      { timestamp: 300, beatsPerMinute: 120 },
      { timestamp: 100, beatsPerMinute: 90 },
      { timestamp: 99, beatsPerMinute: 80 },
      { timestamp: 301, beatsPerMinute: 130 },
      { timestamp: 150, beatsPerMinute: 0 },
      { timestamp: 150, beatsPerMinute: 301 },
      { timestamp: Number.NaN, beatsPerMinute: 100 },
      { timestamp: 200, beatsPerMinute: Number.NaN },
    ];
    const locations = [
      { timestamp: 100, coords: { timestamp: 100 } },
      { timestamp: 300, coords: { timestamp: 300 } },
    ];

    expect(reduceActivityChartHeartRateSamples(samples, locations)).toEqual([
      { timestamp: 100, beatsPerMinute: 90 },
      { timestamp: 300, beatsPerMinute: 120 },
    ]);
  });

  it('downsamples long heart-rate streams while preserving their time range and interpolation', () => {
    const samples = Array.from({ length: 82 }, (_, index) => ({
      timestamp: 1_000 + index * 100,
      beatsPerMinute: 100 + index,
    }));

    const reduced = reduceActivityChartHeartRateSamples(samples, null);

    expect(reduced).toHaveLength(81);
    expect(reduced[0]).toEqual(samples[0]);
    expect(reduced[40]?.timestamp).toBe(5_050);
    expect(reduced[40]?.beatsPerMinute).toBe(140.5);
    expect(reduced[80]).toEqual(samples[81]);
  });

  it('normalizes activity cards and details using stored or derived elevation', () => {
    const plainActivity = { id: 'activity-1' };
    expect(normalizeActivityCard(plainActivity)).toBe(plainActivity);
    expect(normalizeActivityDetails(plainActivity)).toBe(plainActivity);

    expect(normalizeActivityCard({ id: 'activity-2', elevationGain: 14, kilometresSplit: [] })).toEqual({
      id: 'activity-2',
      elevationGain: 14,
    });
    expect(normalizeActivityCard({ id: 'activity-3', kilometresSplit: [{ lastKilometerAltitude: 7 }] })).toEqual({
      id: 'activity-3',
      elevationGain: 7,
    });
    expect(normalizeActivityCard({ id: 'activity-4', elevationGain: Number.NaN, kilometresSplit: [] })).toEqual({
      id: 'activity-4',
      elevationGain: 0,
    });

    const detailedActivity = { id: 'activity-5', elevationGain: 9 };
    expect(normalizeActivityDetails(detailedActivity)).toBe(detailedActivity);
    expect(normalizeActivityDetails({ id: 'activity-6', kilometresSplit: [{ lastKilometerAltitude: 5 }] })).toEqual({
      id: 'activity-6',
      kilometresSplit: [{ lastKilometerAltitude: 5 }],
      elevationGain: 5,
    });
    expect(
      normalizeActivityDetails({ id: 'activity-7', elevationGain: Number.POSITIVE_INFINITY, kilometresSplit: [] }),
    ).toEqual({ id: 'activity-7', elevationGain: 0, kilometresSplit: [] });
  });
});
