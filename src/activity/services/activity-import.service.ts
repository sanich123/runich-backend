import { Inject, Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { AccountService } from 'src/account/account.service';
import { ActivityPersistenceService } from './activity-persistence.service';
import { ActivityMediaService } from './activity-media.service';
import { ActivityWriteService } from './activity-write.service';
import { MediaCleanupService } from 'src/storage/services/media-cleanup.service';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { type WatchWorkoutImportDto, type WatchWorkoutImportIdentityDto } from '../dto/activity.dto';
import { handleServiceError } from 'src/common/utils/database-errors';
import { chunkArray } from 'src/common/parsers/chunk-array';
import { calculateActiveCalories, generateActivityTitle } from '../shared/utils';
import { ACTIVITY_ENRICHMENT_STATUS, ACTIVITY_MEDIA_PROCESSING_STATUS } from '../shared/const';
import type { ActivityDatabase, MigratedActivity } from '../shared/types';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';

@Injectable()
export class ActivityImportService {
  private readonly logger = new Logger('ActivityService');
  private readonly mediaPreparationConcurrency = 4;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Inject(ActivityPersistenceService) private readonly persistenceService: ActivityPersistenceService,
    @Optional() @Inject(MediaCleanupService) private readonly mediaCleanupService: MediaCleanupService | undefined,
    @Inject(ActivityWriteService) private readonly writeService: ActivityWriteService,
    @Inject(ActivityMediaService) private readonly mediaService: ActivityMediaService,
    @Optional() @Inject(LatencyMetricsService) private readonly latencyMetrics?: LatencyMetricsService,
  ) {}

  async getWatchWorkoutSyncCandidates(workouts: WatchWorkoutImportIdentityDto[], userId: string) {
    const uniqueWorkouts = workouts.filter(
      (workout, index, all) =>
        all.findIndex(
          (candidate) => candidate.source === workout.source && candidate.sourceActivityId === workout.sourceActivityId,
        ) === index,
    );
    const existingActivities: Array<{
      source: string | null;
      sourceActivityId: string | null;
      sourceAppName: string | null;
      recordingDeviceManufacturer: string | null;
      recordingDeviceModel: string | null;
    }> = uniqueWorkouts.length
      ? await this.prisma.activity.findMany({
          where: {
            userId,
            OR: uniqueWorkouts.map(({ source, sourceActivityId }) => ({ source, sourceActivityId })),
          },
          select: {
            source: true,
            sourceActivityId: true,
            sourceAppName: true,
            recordingDeviceManufacturer: true,
            recordingDeviceModel: true,
          },
        })
      : [];
    const existingBySourceKey = new Map(
      existingActivities.map((activity) => [`${activity.source}\u0000${activity.sourceActivityId}`, activity]),
    );
    const workoutsToSync = uniqueWorkouts.filter((workout) => {
      const existing = existingBySourceKey.get(`${workout.source}\u0000${workout.sourceActivityId}`);
      return (
        !existing ||
        (existing.sourceAppName == null && Boolean(workout.sourceAppName?.trim())) ||
        (existing.recordingDeviceManufacturer == null && Boolean(workout.recordingDeviceManufacturer?.trim())) ||
        (existing.recordingDeviceModel == null && Boolean(workout.recordingDeviceModel?.trim()))
      );
    });
    return { workoutsToSync };
  }

  async importWatchWorkouts(workouts: WatchWorkoutImportDto[], userId: string) {
    const uniqueWorkouts = workouts.filter((workout, index, all) => {
      return (
        all.findIndex(
          (candidate) => candidate.source === workout.source && candidate.sourceActivityId === workout.sourceActivityId,
        ) === index
      );
    });

    const existingActivities: Array<{
      id: string;
      source: string | null;
      sourceActivityId: string | null;
      sourceAppName: string | null;
      recordingDeviceManufacturer: string | null;
      recordingDeviceModel: string | null;
    }> = uniqueWorkouts.length
      ? await this.prisma.activity.findMany({
          where: {
            userId,
            OR: uniqueWorkouts.map(({ source, sourceActivityId }) => ({ source, sourceActivityId })),
          },
          select: {
            id: true,
            source: true,
            sourceActivityId: true,
            sourceAppName: true,
            recordingDeviceManufacturer: true,
            recordingDeviceModel: true,
          },
        })
      : [];
    const existingActivitiesBySourceKey = new Map(
      existingActivities.map((activity) => [`${activity.source}\u0000${activity.sourceActivityId}`, activity]),
    );
    const activities: unknown[] = [];

    for (const workout of uniqueWorkouts) {
      const key = `${workout.source}\u0000${workout.sourceActivityId}`;
      const existingActivity = existingActivitiesBySourceKey.get(key);
      if (existingActivity) {
        const provenance = {
          ...(existingActivity.sourceAppName == null && workout.sourceAppName?.trim()
            ? { sourceAppName: workout.sourceAppName.trim() }
            : {}),
          ...(existingActivity.recordingDeviceManufacturer == null && workout.recordingDeviceManufacturer?.trim()
            ? { recordingDeviceManufacturer: workout.recordingDeviceManufacturer.trim() }
            : {}),
          ...(existingActivity.recordingDeviceModel == null && workout.recordingDeviceModel?.trim()
            ? { recordingDeviceModel: workout.recordingDeviceModel.trim() }
            : {}),
        };
        if (Object.keys(provenance).length) {
          await this.prisma.activity.updateMany({
            where: {
              id: existingActivity.id,
              ...(provenance.sourceAppName ? { sourceAppName: null } : {}),
              ...(provenance.recordingDeviceManufacturer ? { recordingDeviceManufacturer: null } : {}),
              ...(provenance.recordingDeviceModel ? { recordingDeviceModel: null } : {}),
            },
            data: provenance,
          });
        }
        continue;
      }
      activities.push(await this.writeService.createActivity(workout, userId));
    }

    return {
      imported: activities.length,
      skipped: workouts.length - activities.length,
      activities,
    };
  }

  async createActivitiesFromMigrationArchive(
    activities: Omit<MigratedActivity, 'id'>[],
    database: ActivityDatabase = this.prisma,
  ): Promise<{ success: true; importedActivities: number }> {
    if (!activities.length) return { success: true, importedActivities: 0 };

    if (database === this.prisma) {
      try {
        return await this.prisma.$transaction((transaction) =>
          this.createActivitiesFromMigrationArchive(activities, transaction),
        );
      } catch (error) {
        handleServiceError(error);
      }
    }

    try {
      const seenSourceActivities = new Set<string>();
      const uniqueActivities = activities.filter((activity) => {
        const key = activity.userId + '\u0000' + activity.source + '\u0000' + activity.sourceActivityId;
        if (seenSourceActivities.has(key)) return false;
        seenSourceActivities.add(key);
        return true;
      });
      const activityIdsByUser = new Map<string, Set<string>>();
      for (const activity of uniqueActivities) {
        const ids = activityIdsByUser.get(activity.userId) ?? new Set<string>();
        ids.add(activity.sourceActivityId);
        activityIdsByUser.set(activity.userId, ids);
      }
      const existingActivities = activityIdsByUser.size
        ? ((await database.activity.findMany({
            where: {
              OR: [...activityIdsByUser].map(([userId, sourceActivityIds]) => ({
                userId,
                source: 'strava',
                sourceActivityId: { in: [...sourceActivityIds] },
              })),
            },
            select: {
              id: true,
              userId: true,
              sourceActivityId: true,
              routeStorageKey: true,
              heartRateStorageKey: true,
              mapPhotoUrl: true,
              routeOnlyMapPhotoUrl: true,
              hideMap: true,
              textModerationStatus: true,
            },
          })) as {
            id: string;
            userId: string;
            sourceActivityId: string;
            routeStorageKey: string | null;
            heartRateStorageKey: string | null;
            mapPhotoUrl: string | null;
            routeOnlyMapPhotoUrl: string | null;
            hideMap: boolean;
            textModerationStatus: string;
          }[])
        : [];
      const existingActivitiesBySource = new Map(
        existingActivities.map(
          (activity) => [activity.userId + '\u0000strava\u0000' + activity.sourceActivityId, activity] as const,
        ),
      );
      const calorieProfileByUser = new Map<string, Awaited<ReturnType<AccountService['getAccountByUserId']>>>();
      const usersNeedingCalories = [
        ...new Set(uniqueActivities.filter(({ caloriesActive }) => caloriesActive == null).map(({ userId }) => userId)),
      ];
      await Promise.all(
        usersNeedingCalories.map(async (userId) => {
          if (typeof this.accountService.getAccountByUserId !== 'function') return;
          calorieProfileByUser.set(userId, await this.accountService.getAccountByUserId(userId));
        }),
      );
      const activitiesWithTitles = uniqueActivities.map((activity) => {
        const key = activity.userId + '\u0000' + activity.source + '\u0000' + activity.sourceActivityId;
        const existingActivity = existingActivitiesBySource.get(key);
        const sourceId = 'id' in activity && typeof activity.id === 'string' ? activity.id : randomUUID();
        const profile = calorieProfileByUser.get(activity.userId);
        const caloriesActive =
          activity.caloriesActive ??
          calculateActiveCalories({
            weight: profile?.weight,
            height: profile?.height,
            age: profile?.age,
            gender: profile?.gender,
            sport: activity.sport,
            distance: activity.distance,
            duration: activity.duration,
          });
        return {
          ...activity,
          caloriesActive,
          sourceAppName: activity.sourceAppName?.trim() || 'Strava',
          textModerationStatus:
            existingActivity?.textModerationStatus === 'pending' ||
            existingActivity?.textModerationStatus === 'processing'
              ? 'visible'
              : (existingActivity?.textModerationStatus ?? 'visible'),
          textModerationProcessingStartedAt: null,
          hideMap: existingActivity?.hideMap ?? activity.hideMap ?? false,
          // Use a fresh storage namespace for replacements so immutable map caches cannot serve old imagery.
          id: existingActivity ? randomUUID() : sourceId,
          title: activity.title?.trim()
            ? activity.title
            : generateActivityTitle(activity.sport, activity.date, activity.timeZone),
        };
      });
      const chunkedActivities = chunkArray(activitiesWithTitles, 100);
      const importedCounts = await Promise.all(
        chunkedActivities.map(async (activityBatch) => {
          const preparedActivities: {
            data: Record<string, unknown>;
            routeKey?: string;
            heartRateKey?: string;
            mapKey?: string;
            routeOnlyMapKey?: string;
            existingActivity?: (typeof existingActivities)[number];
            userId: string;
          }[] = [];
          try {
            const mediaPreparationStartedAt = performance.now();
            for (const preparationBatch of chunkArray(activityBatch, this.mediaPreparationConcurrency)) {
              const preparationResults = await Promise.allSettled(
                preparationBatch.map(async (activity) => {
                  const key = activity.userId + '\u0000' + activity.source + '\u0000' + activity.sourceActivityId;
                  const existingActivity = existingActivitiesBySource.get(key);
                  const prepared = await this.mediaService.prepareActivityRoute(activity);
                  const preparedData = prepared.data as unknown as Record<string, unknown>;
                  const data = existingActivity
                    ? {
                        ...preparedData,
                        id: existingActivity.id,
                        timeZone: preparedData.timeZone ?? null,
                        description: preparedData.description ?? null,
                        elevationGain: preparedData.elevationGain ?? null,
                        kilometresSplit: preparedData.kilometresSplit ?? [],
                        mapPhotoUrl:
                          typeof preparedData.mapPhotoUrl === 'string' && preparedData.mapPhotoUrl.trim()
                            ? preparedData.mapPhotoUrl
                            : null,
                        routeOnlyMapPhotoUrl:
                          typeof preparedData.routeOnlyMapPhotoUrl === 'string' &&
                          preparedData.routeOnlyMapPhotoUrl.trim()
                            ? preparedData.routeOnlyMapPhotoUrl
                            : null,
                        routeStorageKey: preparedData.routeStorageKey ?? null,
                        routeFormatVersion: preparedData.routeFormatVersion ?? null,
                        routePointCount: preparedData.routePointCount ?? null,
                        routeSizeBytes: preparedData.routeSizeBytes ?? null,
                        routeChecksum: preparedData.routeChecksum ?? null,
                        mapPhotoUrlBlurhash: null,
                        mediaProcessingStatus: ACTIVITY_MEDIA_PROCESSING_STATUS.queued,
                        locationName: null,
                        weatherTemperature: null,
                        weatherWindSpeed: null,
                        weatherCode: null,
                        locationEnrichmentStatus: ACTIVITY_ENRICHMENT_STATUS.queued,
                        caloriesActive: preparedData.caloriesActive ?? null,
                      }
                    : preparedData;
                  return {
                    data,
                    routeKey: prepared.routeKey,
                    heartRateKey: prepared.heartRateKey,
                    mapKey: prepared.mapKey,
                    routeOnlyMapKey: prepared.routeOnlyMapKey,
                    existingActivity,
                    userId: activity.userId,
                  };
                }),
              );
              for (const result of preparationResults) {
                if (result.status === 'fulfilled') preparedActivities.push(result.value);
              }
              const failedPreparation = preparationResults.find((result) => result.status === 'rejected');
              if (failedPreparation?.status === 'rejected') throw failedPreparation.reason;
            }
            const mediaPreparationDurationMs = Math.round(performance.now() - mediaPreparationStartedAt);
            const mediaPhaseMetrics = this.latencyMetrics
              ?.drainSnapshots()
              .filter(
                ({ category, name }) =>
                  (category === 'processing' &&
                    [
                      'activity_route.encode',
                      'activity_heart_rate.encode',
                      'static_map.vector.render',
                      'static_map.route_only.render',
                    ].includes(name)) ||
                  (category === 'external' &&
                    [
                      's3.activityRoute.putObject',
                      's3.activityHeartRate.putObject',
                      's3.activityMap.putObject',
                      's3.routeOnlyMap.putObject',
                    ].includes(name)),
              )
              .map(
                ({ category, name, count, p50, p95 }) =>
                  `${category}.${name}=n${count}/p50:${Math.round(p50)}ms/p95:${Math.round(p95)}ms`,
              )
              .join(',');

            const preparedData = preparedActivities.map(({ data }) => {
              const activityData = { ...data };
              delete activityData.media;
              return activityData;
            });
            const media = preparedActivities.flatMap(({ data }) =>
              this.mediaService.getActivityMediaRows(data.id, data.userId, data.date ?? new Date(), data.media),
            );
            const dbWriteStartedAt = performance.now();
            const result = await this.persistenceService.upsertMany(preparedData, database, media);
            const cleanupJobs = preparedActivities.flatMap(
              ({ routeKey, heartRateKey, mapKey, routeOnlyMapKey, existingActivity, userId }) => {
                if (!existingActivity) return [];
                const oldKeys = this.mediaService.getActivityStorageKeys(userId, {
                  routeStorageKey: existingActivity.routeStorageKey,
                  heartRateStorageKey: existingActivity.heartRateStorageKey,
                  mapPhotoUrl: existingActivity.mapPhotoUrl,
                  routeOnlyMapPhotoUrl: existingActivity.routeOnlyMapPhotoUrl,
                  media: [],
                });
                const newKeys = new Set(
                  [routeKey, heartRateKey, mapKey, routeOnlyMapKey].filter((key): key is string => Boolean(key)),
                );
                return oldKeys.filter((key) => !newKeys.has(key)).map((storageKey) => ({ userId, storageKey }));
              },
            );
            if (this.mediaCleanupService) {
              await Promise.all(
                cleanupJobs.map(({ userId, storageKey }) =>
                  this.mediaCleanupService!.enqueueObjectCleanup(userId, storageKey, database),
                ),
              );
            }
            const dbWriteDurationMs = Math.round(performance.now() - dbWriteStartedAt);
            this.logger.log(
              `Strava import batch: activities=${activityBatch.length}, ` +
                `media_prepare=${mediaPreparationDurationMs}ms, db_write=${dbWriteDurationMs}ms` +
                (mediaPhaseMetrics ? `, media_phases=[${mediaPhaseMetrics}]` : ''),
            );
            return result;
          } catch (error) {
            await Promise.all(
              preparedActivities
                .flatMap(({ routeKey, heartRateKey, mapKey, routeOnlyMapKey }) => [
                  routeKey,
                  heartRateKey,
                  mapKey,
                  routeOnlyMapKey,
                ])
                .map((key) => this.mediaService.deleteUploadedRoute(key)),
            );
            throw error;
          }
        }),
      );
      return {
        success: true,
        importedActivities: importedCounts.reduce((total, result) => total + result.count, 0),
      };
    } catch (error) {
      handleServiceError(error);
    }
  }
}
