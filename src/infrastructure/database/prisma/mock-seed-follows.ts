import { randomUUID } from 'node:crypto';

import type { DatabaseRepositories } from './database-repository';
import { MAX_MOCK_RELATION_COUNT } from './mock-seed.constants';
import { createManyInBatches, random } from './mock-seed.helpers';
import type { AnyRecord, SeedUser } from './mock-seed.types';

export async function seedMockFollows(prisma: DatabaseRepositories, allUsers: SeedUser[]) {
  const usersById = new Map(allUsers.map((user) => [user.id, user]));
  const followerCapacity = new Map(
    allUsers.map((user, userIndex) => [user.id, random(600_000 + userIndex, MAX_MOCK_RELATION_COUNT)]),
  );
  const friendRows: AnyRecord[] = [];

  for (const [userIndex, user] of allUsers.entries()) {
    const followCount = random(500_000 + userIndex, MAX_MOCK_RELATION_COUNT);
    const followedIds = new Set<string>();

    for (let offset = 1; offset <= allUsers.length && followedIds.size < followCount; offset += 1) {
      const candidate = allUsers[(userIndex + offset) % allUsers.length];
      const capacity = followerCapacity.get(candidate.id) ?? 0;
      if (candidate.id !== user.id && capacity > 0) {
        followedIds.add(candidate.id);
        followerCapacity.set(candidate.id, capacity - 1);
      }
    }

    for (const friendId of followedIds) {
      const friend = usersById.get(friendId);
      if (!friend) throw new Error(`Не найден профиль тестового пользователя: ${friendId}`);
      friendRows.push({ id: randomUUID(), userId: user.id, friendId, profileId: friend.profile.id });
    }
  }

  await createManyInBatches(friendRows, (data) => prisma.friend.createMany({ data }));
  return friendRows.length;
}
