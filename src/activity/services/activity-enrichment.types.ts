export type ActivityEnrichmentRecord = {
  id: string;
  routeStorageKey: string | null;
  kilometresSplit: unknown;
  date: Date;
  timeZone: string | null;
};

export type WeatherResponse = {
  hourly?: {
    time?: unknown[];
    temperature_2m?: unknown[];
    wind_speed_10m?: unknown[];
    weather_code?: unknown[];
  };
};

export type Coordinate = { latitude: number; longitude: number };
