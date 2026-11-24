import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { ACTIVITY_UPDATE_FIELDS } from '../shared/const';
import type { ActivityDatabase } from '../shared/types';

@Injectable()
export class ActivityPersistenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(data: Record<string, unknown>, media: Record<string, unknown>[] = []) {
    if (!media.length) return this.prisma.activity.create({ data });

    return this.prisma.$transaction(async (transaction) => {
      const activity = await transaction.activity.create({ data });
      await transaction.activityMedia.createMany({ data: media, skipDuplicates: true });
      return activity;
    });
  }

  async createMany(
    data: Record<string, unknown>[],
    database: ActivityDatabase = this.prisma,
    media: Record<string, unknown>[] = [],
  ) {
    const result = await database.activity.createMany({ data, skipDuplicates: true });
    if (media.length) await database.activityMedia.createMany({ data: media, skipDuplicates: true });
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
          create: activity,
          update,
        });
      }),
    );

    const persistedIds = new Map<string, string>();
    data.forEach((activity, index) => {
      const sourceId = activity.id;
      const persistedId = activities[index]?.id;
      if (typeof sourceId === 'string' && typeof persistedId === 'string') {
        persistedIds.set(sourceId, persistedId);
      }
    });
    const mediaRows = media.map((item) => {
      const activityId = item.activityId;
      return {
        ...item,
        activityId: typeof activityId === 'string' ? (persistedIds.get(activityId) ?? activityId) : activityId,
      };
    });
    if (mediaRows.length) {
      await database.activityMedia.createMany({ data: mediaRows, skipDuplicates: true });
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
    return this.prisma.activity.update({ where: { id, userId }, data });
  }

  delete(id: string, userId: string) {
    return this.prisma.activity.delete({ where: { id, userId } });
  }
}
