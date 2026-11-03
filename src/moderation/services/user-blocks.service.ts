import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_BLOCKED_USERS } from '../shared/moderation.constants';

@Injectable()
export class UserBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException('Нельзя заблокировать себя');
    const blockedUser = await this.prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!blockedUser) throw new NotFoundException('Пользователь не найден');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      });
      await transaction.friend.deleteMany({
        where: {
          OR: [
            { userId: blockerId, friendId: blockedId },
            { userId: blockedId, friendId: blockerId },
          ],
        },
      });
    });
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }

  async getBlockedUsers(blockerId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      take: MAX_BLOCKED_USERS,
      select: { blockedId: true, createdAt: true },
    });
    if (!blocks.length) return { items: [] };

    const userIds = blocks.map(({ blockedId }: { blockedId: string }) => blockedId);
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, name: true, surname: true, profilePhoto: true, profilePhotoBlurhash: true },
    });
    const profileByUserId = new Map(profiles.map((profile: Record<string, unknown>) => [profile.userId, profile]));
    return {
      items: blocks.map(({ blockedId, createdAt }: { blockedId: string; createdAt: Date }) => ({
        blockedUserId: blockedId,
        createdAt,
        profile: profileByUserId.get(blockedId) ?? null,
      })),
    };
  }
}
