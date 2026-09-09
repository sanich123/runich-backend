import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { Filtering } from './filter.decorator';
import type { ProfileWhereInput } from './type';
import { encodeProfileCursor, type ProfileCursor } from './account.pagination';

const DEFAULT_PROFILE_PAGE_SIZE = 10;

const PROFILE_SEARCH_SELECT = {
  id: true,
  userId: true,
  name: true,
  surname: true,
  city: true,
  profilePhoto: true,
  profilePhotoBlurhash: true,
} as const;

function normalizeFilterValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function buildProfileWhere(filter: Filtering): ProfileWhereInput {
  const searchValues = [filter.name, filter.surname, filter.email];
  const searchTerms = searchValues.flatMap((value) => normalizeFilterValue(value)?.split(/\s+/) ?? []);
  const conditions: ProfileWhereInput[] = [];

  for (const term of searchTerms) {
    conditions.push({
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { surname: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

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
