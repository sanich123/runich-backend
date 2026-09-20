import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/storage.service';
import { getLocalDateTimeParts, isValidIanaTimeZone } from 'src/common/utils/time-zone';
import type { LocationObject } from './activity.dto';
import { ACTIVITY_ENRICHMENT_CONFIG, ACTIVITY_ENRICHMENT_STATUS } from './activity-enrichment.constants';

type ActivityEnrichmentRecord = {
  id: string;
  routeStorageKey: string | null;
  kilometresSplit: unknown;
  date: Date;
  timeZone: string | null;
};

type MapboxContextEntry = { name?: unknown };

type MapboxFeature = {
  properties?: {
    feature_type?: unknown;
    name?: unknown;
    name_preferred?: unknown;
    context?: Record<string, MapboxContextEntry>;
  };
};

type MapboxResponse = { features?: MapboxFeature[] };

type WeatherResponse = {
  hourly?: {
    time?: unknown[];
    temperature_2m?: unknown[];
    wind_speed_10m?: unknown[];
    weather_code?: unknown[];
  };
};

type Coordinate = { latitude: number; longitude: number };

@Injectable()
export class ActivityEnrichmentService {
  private readonly logger = new Logger(ActivityEnrichmentService.name);
  private readonly batchSize = ACTIVITY_ENRICHMENT_CONFIG.batchSize;
  private readonly pollIntervalMs = ACTIVITY_ENRICHMENT_CONFIG.workerPollIntervalMs;
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  requestStop() {
    this.stopRequested = true;
  }

  async processNextBatch() {
    const activities = await this.prisma.activity.findMany({
      where: { locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.queued },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
      select: {
        id: true,
        routeStorageKey: true,
        kilometresSplit: true,
        date: true,
        timeZone: true,
      },
    });
    if (!activities.length) return false;

    for (const activity of activities as ActivityEnrichmentRecord[]) {
      await this.processActivity(activity);
    }
    return true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedActivities();
    this.logger.log(`Worker обогащения активностей запущен: batch=${this.batchSize}, poll=${this.pollIntervalMs}ms`);

    while (!this.stopRequested) {
      try {
        const foundActivities = await this.processNextBatch();
        if (!foundActivities) await delay(this.pollIntervalMs);
      } catch (error) {
        this.logger.error('Ошибка цикла worker обогащения активностей', this.getErrorMessage(error));
        await delay(this.pollIntervalMs);
      }
    }

    this.logger.log('Worker обогащения активностей остановлен');
  }

  private async processActivity(activity: ActivityEnrichmentRecord) {
    const claimed = await this.prisma.activity.updateMany({
      where: {
        id: activity.id,
        locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.queued,
      },
      data: { locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.processing },
    });
    if (claimed.count === 0) return;

    try {
      const coordinate = await this.getActivityCoordinate(activity);
      if (!coordinate) {
        await this.completeActivity(activity.id, null, null, null, null);
        return;
      }

      const [locationResult, weatherResult] = await Promise.allSettled([
        this.getLocationName(coordinate),
        this.getWeather(coordinate, activity.date, activity.timeZone),
      ]);

      if (locationResult.status === 'rejected') {
        this.logger.warn(
          `Не удалось определить место активности ${activity.id}: ${this.getErrorMessage(locationResult.reason)}`,
        );
      }
      if (weatherResult.status === 'rejected') {
        this.logger.warn(
          `Не удалось определить погоду активности ${activity.id}: ${this.getErrorMessage(weatherResult.reason)}`,
        );
      }

      const locationName = locationResult.status === 'fulfilled' ? locationResult.value : null;
      const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
      await this.completeActivity(
        activity.id,
        locationName,
        weather?.temperature ?? null,
        weather?.windSpeed ?? null,
        weather?.code ?? null,
      );
    } catch (error) {
      this.logger.error(`Не удалось обогатить активность ${activity.id}`, this.getErrorMessage(error));
      await this.prisma.activity.updateMany({
        where: {
          id: activity.id,
          locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.processing,
        },
        data: {
          locationName: null,
          weatherTemperature: null,
          weatherWindSpeed: null,
          weatherCode: null,
          locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.completed,
        },
      });
    }
  }

  private async completeActivity(
    id: string,
    locationName: string | null,
    temperature: number | null,
    windSpeed: number | null,
    code: number | null,
  ) {
    await this.prisma.activity.update({
      where: { id },
      data: {
        locationName,
        weatherTemperature: temperature,
        weatherWindSpeed: windSpeed,
        weatherCode: code,
        locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.completed,
      },
    });
  }

  private async getActivityCoordinate(activity: ActivityEnrichmentRecord) {
    const locations = activity.routeStorageKey
      ? await this.storageService.readActivityRoute(activity.routeStorageKey)
      : this.getLocationsFromKilometreSplits(activity.kilometresSplit);

    return (
      locations.find((location) => {
        if (!location || typeof location !== 'object' || !location.coords || typeof location.coords !== 'object') {
          return false;
        }

        const { latitude, longitude } = location.coords;
        return (
          location.coords.mocked !== true &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        );
      })?.coords ?? null
    );
  }

  private getLocationsFromKilometreSplits(value: unknown): LocationObject[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((split) => {
      if (!split || typeof split !== 'object') return [];
      const point = (split as { kilometerPoint?: unknown }).kilometerPoint;
      if (!point || typeof point !== 'object' || !('coords' in point)) return [];
      const coords = (point as { coords?: unknown }).coords;
      if (!coords || typeof coords !== 'object') return [];
      return [point as LocationObject];
    });
  }

  private async getLocationName(coordinate: Coordinate) {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN?.trim();
    if (!accessToken) return null;

    const query = new URLSearchParams({
      longitude: String(coordinate.longitude),
      latitude: String(coordinate.latitude),
      language: 'ru',
      worldview: 'ru',
      types: 'place,locality,district',
      permanent: 'true',
      access_token: accessToken,
    });
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${query}`, {
      signal: AbortSignal.timeout(ACTIVITY_ENRICHMENT_CONFIG.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`Mapbox reverse geocoding returned ${response.status}`);

    const payload = (await response.json()) as MapboxResponse;
    return this.pickLocationName(payload.features ?? []);
  }

  private pickLocationName(features: MapboxFeature[]) {
    const priority = ['place', 'locality', 'district'];
    for (const type of priority) {
      for (const feature of features) {
        const properties = feature.properties;
        if (properties?.feature_type === type) {
          const name = this.getString(properties.name_preferred) ?? this.getString(properties.name);
          if (name) return name;
        }
        const contextEntry = properties?.context?.[type];
        const contextName = this.getString(contextEntry?.name);
        if (contextName) return contextName;
      }
    }
    return null;
  }

  private async getWeather(coordinate: Coordinate, date: Date, activityTimeZone: string | null) {
    const timeZone = activityTimeZone && isValidIanaTimeZone(activityTimeZone) ? activityTimeZone : 'UTC';
    const localDateTime = getLocalDateTimeParts(date, timeZone);
    const dateString = `${localDateTime.year}-${String(localDateTime.month).padStart(2, '0')}-${String(localDateTime.day).padStart(2, '0')}`;
    const targetTime = `${dateString}T${String(localDateTime.hour).padStart(2, '0')}:00`;
    const query = new URLSearchParams({
      latitude: String(coordinate.latitude),
      longitude: String(coordinate.longitude),
      start_date: dateString,
      end_date: dateString,
      hourly: 'temperature_2m,wind_speed_10m,weather_code',
      timezone: timeZone,
      temperature_unit: 'celsius',
      wind_speed_unit: 'ms',
    });
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${query}`, {
      signal: AbortSignal.timeout(ACTIVITY_ENRICHMENT_CONFIG.requestTimeoutMs),
    });
    if (!response.ok) throw new Error(`Open-Meteo archive returned ${response.status}`);

    const payload = (await response.json()) as WeatherResponse;
    const times = payload.hourly?.time ?? [];
    const index = times.findIndex((time) => time === targetTime);
    if (index < 0) return null;

    const temperature = this.getFiniteNumber(payload.hourly?.temperature_2m?.[index]);
    const windSpeed = this.getFiniteNumber(payload.hourly?.wind_speed_10m?.[index]);
    const code = this.getFiniteNumber(payload.hourly?.weather_code?.[index]);
    if (temperature === null && windSpeed === null && code === null) return null;
    return { temperature, windSpeed, code };
  }

  private async requeueInterruptedActivities() {
    await this.prisma.activity.updateMany({
      where: { locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.processing },
      data: { locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.queued },
    });
  }

  private getString(value: unknown) {
    if (typeof value !== 'string') return null;
    const result = value.trim();
    return result || null;
  }

  private getFiniteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
