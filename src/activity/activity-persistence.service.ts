import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

@Injectable()
export class ActivityPersistenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(data: Record<string, unknown>) {
    return this.prisma.activity.create({ data: data as never });
  }

  createMany(data: Record<string, unknown>[]) {
    return this.prisma.activity.createMany({ data: data as never, skipDuplicates: true });
  }

  update(id: string, userId: string, data: Record<string, unknown>) {
    return this.prisma.activity.update({ where: { id, userId }, data: data as never });
  }

  delete(id: string, userId: string) {
    return this.prisma.activity.delete({ where: { id, userId } });
  }
}
