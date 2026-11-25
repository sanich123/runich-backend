import type { AccountService } from 'src/account/account.service';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { StorageService } from 'src/storage/services/storage.service';
import type { MediaCleanupService } from 'src/storage/services/media-cleanup.service';
import type { StaticMapService } from 'src/common/maps/static-map.service';
import { ActivityAccessService } from '../../services/activity-access.service';
import { ActivityContentReadService } from '../../services/activity-content-read.service';
import { ActivityFeedService } from '../../services/activity-feed.service';
import { ActivityFriendsFeedService } from '../../services/activity-friends-feed.service';
import { ActivityImportService } from '../../services/activity-import.service';
import { ActivityMediaService } from '../../services/activity-media.service';
import { ActivityPersistenceService } from '../../services/activity-persistence.service';
import { ActivityReadService } from '../../services/activity-read.service';
import { ActivityRouteFeedService } from '../../services/activity-route-feed.service';
import { ActivityService } from '../../services/activity.service';
import { ActivityWriteService } from '../../services/activity-write.service';

export function createActivityService(
  prisma: PrismaService,
  accountService: AccountService,
  persistenceService?: ActivityPersistenceService,
  storageService?: StorageService,
  mediaCleanupService?: MediaCleanupService,
  staticMapService?: StaticMapService,
  activityAccessService?: ActivityAccessService,
  activityReadService?: ActivityReadService,
  activityMediaService?: ActivityMediaService,
  activityWriteService?: ActivityWriteService,
  activityImportService?: ActivityImportService,
) {
  const persistence = persistenceService ?? new ActivityPersistenceService(prisma);
  const access = activityAccessService ?? new ActivityAccessService(prisma);
  const content = new ActivityContentReadService(prisma, access, storageService);
  const feed = new ActivityFeedService(prisma, access, content);
  const routeFeed = new ActivityRouteFeedService(prisma, content);
  const friendsFeed = new ActivityFriendsFeedService(prisma, accountService, content, storageService);
  const read = activityReadService ?? new ActivityReadService(content, feed, routeFeed, friendsFeed);
  const media =
    activityMediaService ?? new ActivityMediaService(prisma, storageService, mediaCleanupService, staticMapService);
  const write =
    activityWriteService ??
    new ActivityWriteService(
      prisma,
      accountService,
      persistence,
      storageService,
      mediaCleanupService,
      staticMapService,
      media,
    );
  const activityImport =
    activityImportService ??
    new ActivityImportService(prisma, accountService, persistence, mediaCleanupService, write, media);
  return new ActivityService(prisma, access, read, media, write, activityImport);
}

export function createActivityReadService(
  prisma: PrismaService,
  accountService: AccountService,
  accessService: ActivityAccessService,
  storageService?: StorageService,
) {
  const content = new ActivityContentReadService(prisma, accessService, storageService);
  return new ActivityReadService(
    content,
    new ActivityFeedService(prisma, accessService, content),
    new ActivityRouteFeedService(prisma, content),
    new ActivityFriendsFeedService(prisma, accountService, content, storageService),
  );
}
