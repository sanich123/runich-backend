import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

type ActivityUpdateField =
  | 'date'
  | 'timeZone'
  | 'description'
  | 'distance'
  | 'elevationGain'
  | 'duration'
  | 'speed'
  | 'sport'
  | 'title'
  | 'kilometresSplit'
  | 'heartRateSamples'
  | 'averageHeartRate'
  | 'minHeartRate'
  | 'maxHeartRate'
  | 'mapPhotoUrl'
  | 'routeStorageKey'
  | 'routeFormatVersion'
  | 'routePointCount'
  | 'routeSizeBytes'
  | 'routeChecksum'
  | 'mapPhotoUrlBlurhash'
  | 'mediaProcessingStatus'
  | 'locationName'
  | 'weatherTemperature'
  | 'weatherWindSpeed'
  | 'weatherCode'
  | 'locationEnrichmentStatus'
  | 'caloriesActive';

const ACTIVITY_UPDATE_FIELDS: ActivityUpdateField[] = [
  'date',
  'timeZone',
  'description',
  'distance',
  'elevationGain',
  'duration',
  'speed',
  'sport',
  'title',
  'kilometresSplit',
  'heartRateSamples',
  'averageHeartRate',
  'minHeartRate',
  'maxHeartRate',
  'mapPhotoUrl',
  'routeStorageKey',
  'routeFormatVersion',
  'routePointCount',
  'routeSizeBytes',
  'routeChecksum',
  'mapPhotoUrlBlurhash',
  'mediaProcessingStatus',
  'locationName',
  'weatherTemperature',
  'weatherWindSpeed',
  'weatherCode',
  'locationEnrichmentStatus',
  'caloriesActive',
];

export type ActivityDatabase = Pick<PrismaService, 'activity' | 'activityMedia' | 'mediaCleanupJob'>;

@Injectable()
export class ActivityPersistenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(data: Record<string, unknown>, media: Record<string, unknown>[] = []) {
    if (!media.length) return this.prisma.activity.create({ data: data as never });

    return this.prisma.$transaction(async (transaction) => {
      const activity = await transaction.activity.create({ data: data as never });
      await transaction.activityMedia.createMany({ data: media as never, skipDuplicates: true });
      return activity;
    });
  }

  async createMany(
    data: Record<string, unknown>[],
    database: ActivityDatabase = this.prisma,
    media: Record<string, unknown>[] = [],
  ) {
    const result = await database.activity.createMany({ data: data as never, skipDuplicates: true });
    if (media.length) await database.activityMedia.createMany({ data: media as never, skipDuplicates: true });
    return result;
  }

  async upsertMany(
    data: Record<string, unknown>[],
    database: ActivityDatabase = this.prisma,
    media: Record<string, unknown>[] = [],
  ) {
    const activities = await Promise.all(
      data.map((activity) => {
        const where = {
          userId: activity.userId,
          source: activity.source,
          sourceActivityId: activity.sourceActivityId,
        };
        const update = Object.fromEntries(
          ACTIVITY_UPDATE_FIELDS.filter((field) => activity[field] !== undefined).map((field) => [
            field,
            activity[field],
          ]),
        );
        return database.activity.upsert({
          where: { userId_source_sourceActivityId: where },
          create: activity as never,
          update: update as never,
        });
      }),
    );

    const persistedIds = new Map(
      data.map((activity, index) => [activity.id as string, activities[index]?.id as string] as const),
    );
    const mediaRows = media.map((item) => ({
      ...item,
      activityId: persistedIds.get(item.activityId as string) ?? item.activityId,
    }));
    if (mediaRows.length) {
      await database.activityMedia.createMany({ data: mediaRows as never, skipDuplicates: true });
    }

    await Promise.all(
      activities.flatMap((activity, index) => {
        const activityDate = data[index]?.date;
        if (activityDate === undefined) return [];
        return [
          database.activityMedia.updateMany({
            where: { activityId: activity.id },
            data: { activityDate },
          }),
        ];
      }),
    );

    return { count: activities.length };
  }

  update(id: string, userId: string, data: Record<string, unknown>) {
    return this.prisma.activity.update({ where: { id, userId }, data: data as never });
  }

  delete(id: string, userId: string) {
    return this.prisma.activity.delete({ where: { id, userId } });
  }
}
