type ActivityDtoFixture = {
  duration: number;
  distance: number;
  speed: number;
  sport: string;
};

export function makeActivityDto(overrides: Partial<ActivityDtoFixture> = {}) {
  return {
    duration: 100,
    distance: 1000,
    speed: 10,
    sport: 'run',
    ...overrides,
  };
}

type ActivityPhotoFixture = {
  url: string;
  thumbnail: string | null;
};

export function makeActivityPhoto(overrides: Partial<ActivityPhotoFixture> = {}) {
  return { url: 'photo', thumbnail: null, ...overrides };
}

type QueuedActivityFixture = {
  id: string;
  mediaProcessingStatus: 'queued';
};

export function makeQueuedActivity(overrides: Partial<QueuedActivityFixture> = {}) {
  return { id: 'activity-1', mediaProcessingStatus: 'queued' as const, ...overrides };
}

export function makeMigrationSuccessResult(overrides: { importedActivities?: number } = {}) {
  return { success: true as const, importedActivities: 1, ...overrides };
}

export function makeSmallActivityDto() {
  return makeActivityDto({ duration: 1, distance: 2, speed: 3 });
}

type ActivityProfileFixture = {
  id: string;
  weight: string;
  height: string;
  age: string;
  gender: string;
};

export function makeActivityProfile(overrides: Partial<ActivityProfileFixture> = {}) {
  return {
    id: 'profile-1',
    weight: '80',
    height: '180',
    age: '30',
    gender: 'male',
    ...overrides,
  };
}

type ActivityCaloriesInputFixture = {
  weight: string | null;
  height: string | null;
  age: string | null;
  gender: string | null;
  sport: string;
  distance: number;
  duration: number;
};

export function makeActivityCaloriesInput(overrides: Partial<ActivityCaloriesInputFixture> = {}) {
  return {
    weight: '80',
    height: '180',
    age: '30',
    gender: 'male',
    sport: 'run',
    distance: 10_000,
    duration: 3_600_000,
    ...overrides,
  };
}

type EnrichmentUpdateFixture = {
  weatherTemperature: number | null;
  weatherWindSpeed: number | null;
  weatherCode: number | null;
  locationEnrichmentStatus: 'completed';
};

export function makeCompletedEnrichmentUpdate(overrides: Partial<EnrichmentUpdateFixture> = {}) {
  return {
    weatherTemperature: null,
    weatherWindSpeed: null,
    weatherCode: null,
    locationEnrichmentStatus: 'completed' as const,
    ...overrides,
  };
}

type ActivityMediaFixture = {
  id: string;
  url: string | null;
  mediaReviewStatus?: string;
};

export function makeApprovedActivityMedia(overrides: Partial<ActivityMediaFixture> = {}) {
  return {
    id: 'approved',
    url: 'https://cdn.example/approved.jpg',
    mediaReviewStatus: 'approved',
    ...overrides,
  };
}

type ActivityRouteCoordinateFixture = {
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
};

export function makeActivityRouteCoordinate(overrides: Partial<ActivityRouteCoordinateFixture> = {}) {
  return {
    latitude: 0,
    longitude: 0,
    altitude: 100,
    timestamp: 1_000,
    ...overrides,
  };
}

type MediaProcessingActivityFixture = {
  id: string;
  media: { position: number; url: string; thumbnail: string | null; blurhash: string | null }[];
  mapPhotoUrl: string | null;
  mapPhotoUrlBlurhash: string | null;
};

export function makeMediaProcessingActivity(overrides: Partial<MediaProcessingActivityFixture> = {}) {
  return {
    id: 'activity-1',
    media: [{ position: 0, url: 'photo', thumbnail: null, blurhash: null }],
    mapPhotoUrl: null,
    mapPhotoUrlBlurhash: null,
    ...overrides,
  };
}

type StoredActivityFixture = {
  routeStorageKey: string;
  kilometresSplit: unknown[];
  userId: string;
  visibility: 'private' | 'public';
};

export function makeStoredActivity(overrides: Partial<StoredActivityFixture> = {}) {
  return {
    routeStorageKey: 'user-1/activities/activity-1/locations/locations-v1.json.gz',
    kilometresSplit: [],
    userId: 'user-1',
    visibility: 'private' as const,
    ...overrides,
  };
}
