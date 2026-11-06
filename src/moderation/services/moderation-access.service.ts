import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

@Injectable()
export class ModerationAccessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async areBlocked(firstUserId: string, secondUserId: string) {
    if (firstUserId === secondUserId) return false;
    const block = await this.prisma.userBlock?.findFirst({
      where: {
        OR: [
          { blockerId: firstUserId, blockedId: secondUserId },
          { blockerId: secondUserId, blockedId: firstUserId },
        ],
      },
      select: { id: true },
    });
    return Boolean(block);
  }

  async getBlockedUserIds(userId: string) {
    return this.blockedUserIds(userId);
  }

  async blockedUserIds(userId: string) {
    const blocks = await this.prisma.userBlock?.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return (blocks ?? []).map(({ blockerId, blockedId }: { blockerId: string; blockedId: string }) =>
      blockerId === userId ? blockedId : blockerId,
    );
  }
}
