import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

@Injectable()
export class ActivityPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Record<string, unknown>) {
    return this.prisma.activity.create({ data: data as never });
  }

  createMany(data: Record<string, unknown>[]) {
    return this.prisma.activity.createMany({ data: data as never, skipDuplicates: true });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.activity.update({ where: { id }, data: data as never });
  }

  delete(id: string) {
    return this.prisma.activity.delete({ where: { id } });
  }
}
