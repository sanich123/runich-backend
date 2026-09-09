import type { Filtering } from './filter.decorator';
import type { ProfileWhereInput } from './type';

function normalizeFilterValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function buildProfileWhere(filter: Filtering): ProfileWhereInput {
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
