type CoordinateFixture = {
  latitude: number;
  longitude: number;
};

export function makeMoscowCoordinate(overrides: Partial<CoordinateFixture> = {}) {
  return { latitude: 55.75, longitude: 37.61, ...overrides };
}

export function makeNearbyMoscowCoordinate(overrides: Partial<CoordinateFixture> = {}) {
  return { latitude: 55.76, longitude: 37.62, ...overrides };
}

export function makeRoundedMoscowCoordinate(overrides: Partial<CoordinateFixture> = {}) {
  return { latitude: 55, longitude: 37, ...overrides };
}
