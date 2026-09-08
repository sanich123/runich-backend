import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { handleServiceError } from 'src/common/utils/database-errors';
import { Pagination } from 'src/common/decorators/pagination.decorator';
import { Filtering } from './filter.decorator';

type ProfileWhereInput = Record<string, unknown>;

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

  async getFilteredAccounts({ page, limit, size, offset }: Pagination, filter: Filtering) {
    const where = buildProfileWhere(filter);

    try {
      const [count, profiles] = await this.prisma.$transaction([
        this.prisma.profile.count({ where }),
        this.prisma.profile.findMany({ where, skip: offset, take: limit }),
      ]);

      return {
        totalItems: count,
        items: profiles,
        page,
        size,
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
