import type { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageActivityService } from '../../services/storage-activity.service';
import { StorageCoreService } from '../../services/storage-core.service';
import { StorageModerationService } from '../../services/storage-moderation.service';
import { StorageProfileService } from '../../services/storage-profile.service';
import { StorageService } from '../../services/storage.service';
import { StorageUploadService } from '../../services/storage-upload.service';

export function createStorageService(latencyMetrics?: LatencyMetricsService, prisma?: PrismaService) {
  const core = new StorageCoreService(latencyMetrics);
  const moderation = new StorageModerationService(core, prisma);
  const uploads = new StorageUploadService(core, moderation, prisma);
  const activity = new StorageActivityService(core, prisma);
  const profile = new StorageProfileService(core);
  return new StorageService(core, uploads, moderation, activity, profile);
}
