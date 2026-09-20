import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

export type ActivityDatabase = Pick<PrismaService, 'activity' | 'activityMedia'>;

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

  update(id: string, userId: string, data: Record<string, unknown>) {
    return this.prisma.activity.update({ where: { id, userId }, data: data as never });
  }

  delete(id: string, userId: string) {
    return this.prisma.activity.delete({ where: { id, userId } });
  }
}
