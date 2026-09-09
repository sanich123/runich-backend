import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { Filtering } from './filter.decorator';
import { encodeProfileCursor, type ProfileCursor } from './account.pagination';
import { DEFAULT_PROFILE_PAGE_SIZE, PROFILE_SEARCH_SELECT } from './const';
import { buildProfileWhere } from './utils';

@Injectable()
export class AccountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getFilteredAccounts(
    take = String(DEFAULT_PROFILE_PAGE_SIZE),
    cursor: ProfileCursor | undefined,
    filter: Filtering,
  ) {
    const filterWhere = buildProfileWhere(filter);
    const where = cursor ? { AND: [filterWhere, { id: { gt: cursor.id } }] } : filterWhere;

    try {
      const profilesWithExtraItem = await this.prisma.profile.findMany({
        where,
        orderBy: { id: 'asc' },
        take: Number(take) + 1,
        select: PROFILE_SEARCH_SELECT,
      });
      const hasMore = profilesWithExtraItem.length > Number(take);
      const profiles = profilesWithExtraItem.slice(0, Number(take));

      return {
        items: profiles,
        hasMore,
        nextCursor: hasMore && profiles.length ? encodeProfileCursor(profiles.at(-1)!) : null,
      };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getAccountByUserId(id: string) {
    try {
      return await this.prisma.profile.findUnique({ where: { userId: id } });
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getOrCreateAccountByUserId(id: string) {
    try {
      return await this.prisma.profile.upsert({
        where: { userId: id },
        update: {},
        create: { userId: id },
      });
    } catch (error) {
      handleServiceError(error);
    }
  }
}
