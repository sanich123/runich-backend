import { randomUUID } from 'node:crypto';

import type { DatabaseRepositories } from './database-repository';
import {
  DAY_IN_MS,
  MAX_MOCK_ACTIVITY_PHOTOS,
  MAX_MOCK_RELATION_COUNT,
  MOCK_ACTIVITY_COUNT,
  MOCK_HEART_RATE_ACTIVITY_COUNT,
  MOCK_ROUTE_ONLY_ACTIVITY_COUNT,
  MINUTE_IN_MS,
  MOCK_ACTIVITY_TITLES,
  MOCK_COMMENT_TEXTS,
  MOCK_EMOTIONS,
} from './mock-seed.constants';
import { createManyInBatches, random } from './mock-seed.helpers';
import type { AnyRecord, MockActivitySeedStats, MockUser, SeedUser } from './mock-seed.types';
import type { MockActivityTemplate } from './mock-seed-assets';

export async function seedMockActivities(
  prisma: DatabaseRepositories,
  mockUsers: MockUser[],
  allUsers: SeedUser[],
  activityTemplates: MockActivityTemplate[],
  activityPhotoUrls: readonly string[],
): Promise<MockActivitySeedStats> {
  if (activityTemplates.length !== MOCK_ACTIVITY_COUNT) {
    throw new Error('Mock activity seed requires exactly 100 templates');
  }
  const heartRateTemplateCount = activityTemplates.filter((template) => template.heartRateStorageKey !== null).length;
  const routeOnlyTemplateCount = activityTemplates.length - heartRateTemplateCount;
  if (
    heartRateTemplateCount !== MOCK_HEART_RATE_ACTIVITY_COUNT ||
    routeOnlyTemplateCount !== MOCK_ROUTE_ONLY_ACTIVITY_COUNT
  ) {
    throw new Error('Mock activity seed requires exactly 80 route-only and 20 heart-rate templates');
  }

  const seedStartedAt = Date.now();
  let activityTotal = 0;
  let commentTotal = 0;
  let activityLikeTotal = 0;
  let commentLikeTotal = 0;

  for (const [userIndex, user] of mockUsers.entries()) {
    const profile = user.profile!;
    const activityCount = MOCK_ACTIVITY_COUNT;
    const activityRows: AnyRecord[] = [];
    const mediaRows: AnyRecord[] = [];

    for (let activityIndex = 0; activityIndex < activityCount; activityIndex += 1) {
      const template =
        activityTemplates[(userIndex * MAX_MOCK_RELATION_COUNT + activityIndex) % activityTemplates.length];
      const activityDate = new Date(seedStartedAt - (activityIndex + MAX_MOCK_RELATION_COUNT) * DAY_IN_MS);

      activityRows.push({
        id: randomUUID(),
        userId: user.id,
        profileId: profile.id,
        title:
          template?.title ??
          `${MOCK_ACTIVITY_TITLES[activityIndex % MOCK_ACTIVITY_TITLES.length]} #${activityIndex + 1}`,
        description: template?.description ?? 'Mock activity for the Runich feed',
        sport: template.sport,
        distance: template.distance,
        duration: template.duration,
        speed: template.speed,
        date: activityDate,
        elevationGain: template.elevationGain,
        emotion: template?.emotion ?? MOCK_EMOTIONS[activityIndex % MOCK_EMOTIONS.length],
        visibility: 'public',
        kilometresSplit: template?.kilometresSplit ?? [
          { kilometre: 1, pace: 280 + random(userIndex + activityIndex, 45) },
          { kilometre: 2, pace: 285 + random(userIndex + activityIndex + 20, 45) },
        ],
        steps: template.steps,
        locationName: template.locationName,
        weatherTemperature: template.weatherTemperature,
        weatherWindSpeed: template.weatherWindSpeed,
        weatherCode: template.weatherCode,
        caloriesActive: template.caloriesActive,
        routeStorageKey: template.routeStorageKey,
        routeFormatVersion: template.routeFormatVersion,
        routePointCount: template.routePointCount,
        routeSizeBytes: template.routeSizeBytes,
        routeChecksum: template.routeChecksum,
        heartRateStorageKey: template.heartRateStorageKey,
        averageHeartRate: template.averageHeartRate,
        minHeartRate: template.minHeartRate,
        maxHeartRate: template.maxHeartRate,
        mapPhotoUrl: template.mapPhotoUrl,
        mapPhotoUrlBlurhash: null,
      });
      const activity = activityRows.at(-1)!;

      const photoCount = random((userIndex + 1) * 30_000 + activityIndex, MAX_MOCK_ACTIVITY_PHOTOS);
      for (let photoIndex = 0; photoIndex < photoCount; photoIndex += 1) {
        const photo = activityPhotoUrls[(userIndex + activityIndex + photoIndex) % activityPhotoUrls.length];
        mediaRows.push({
          activityId: activity.id,
          userId: activity.userId,
          activityDate: activity.date,
          position: photoIndex,
          url: photo,
          thumbnail: photo,
        });
      }
    }

    await createManyInBatches(activityRows, (data) => prisma.activity.createMany({ data }));
    await createManyInBatches(mediaRows, (data) => prisma.activityMedia.createMany({ data }));
    activityTotal += activityRows.length;

    for (const [activityIndex, activity] of activityRows.entries()) {
      const activityDate = new Date(activity.date ?? Date.now());
      const activityLikeRows: AnyRecord[] = [];
      const commentRows: AnyRecord[] = [];
      const commentLikeRows: AnyRecord[] = [];
      const activityLikeCount = random((userIndex + 1) * 20_000 + activityIndex, MAX_MOCK_RELATION_COUNT);

      for (let likeIndex = 0; likeIndex < activityLikeCount; likeIndex += 1) {
        const liker = allUsers[(likeIndex + userIndex + activityIndex + 1) % allUsers.length];
        activityLikeRows.push({
          id: randomUUID(),
          activityId: activity.id!,
          profileId: liker.profile.id,
          authorId: liker.id,
          date: new Date(activityDate.getTime() + (likeIndex + 1) * MINUTE_IN_MS),
        });
      }

      const commentCount = random((userIndex + 1) * 1000 + activityIndex, MAX_MOCK_RELATION_COUNT);
      for (let commentIndex = 0; commentIndex < commentCount; commentIndex += 1) {
        const author = allUsers[(userIndex + activityIndex + commentIndex + 1) % allUsers.length];
        const commentId = randomUUID();
        const commentDate = new Date(activityDate.getTime() + (commentIndex + 1) * 15 * MINUTE_IN_MS);

        commentRows.push({
          id: commentId,
          date: commentDate,
          activityId: activity.id!,
          profileId: author.profile.id,
          authorId: author.id,
          comment: MOCK_COMMENT_TEXTS[(userIndex + activityIndex + commentIndex) % MOCK_COMMENT_TEXTS.length],
        });

        const commentLikeCount = random(
          (userIndex + 1) * 10_000 + activityIndex * MAX_MOCK_RELATION_COUNT + commentIndex,
          MAX_MOCK_RELATION_COUNT,
        );
        for (let likeIndex = 0; likeIndex < commentLikeCount; likeIndex += 1) {
          const liker = allUsers[(likeIndex + commentIndex + activityIndex + userIndex + 1) % allUsers.length];
          commentLikeRows.push({
            id: randomUUID(),
            date: new Date(commentDate.getTime() + (likeIndex + 1) * MINUTE_IN_MS),
            commentId,
            profileId: liker.profile.id,
            authorId: liker.id,
          });
        }
      }

      await createManyInBatches(activityLikeRows, (data) => prisma.like.createMany({ data }));
      await createManyInBatches(commentRows, (data) => prisma.comment.createMany({ data }));
      await createManyInBatches(commentLikeRows, (data) => prisma.commentLike.createMany({ data }));
      activityLikeTotal += activityLikeRows.length;
      commentTotal += commentRows.length;
      commentLikeTotal += commentLikeRows.length;
    }
  }

  return { activityTotal, commentTotal, activityLikeTotal, commentLikeTotal };
}
