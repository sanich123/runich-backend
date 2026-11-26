import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { StorageService } from 'src/storage/services/storage.service';
import { ModerationAppealsService } from '../../services/moderation-appeals.service';
import { ModerationContentNotificationsService } from '../../services/moderation-content-notifications.service';
import { ModerationEmailActionValidationService } from '../../services/moderation-email-action-validation.service';
import { ModerationReportsQueryService } from '../../services/moderation-reports-query.service';
import { ModerationReportsService } from '../../services/moderation-reports.service';
import { ModerationTargetsService } from '../../services/moderation-targets.service';
import { UserBlocksService } from '../../services/user-blocks.service';
import { ModerationService } from '../../moderation.service';

export function createModerationService(prisma: PrismaService, storage: StorageService) {
  const targets = new ModerationTargetsService(prisma, new ModerationContentNotificationsService());
  const reports = new ModerationReportsService(
    prisma,
    storage,
    targets,
    new ModerationReportsQueryService(prisma, storage),
    new ModerationEmailActionValidationService(prisma),
  );
  return new ModerationService(
    targets,
    reports,
    new UserBlocksService(prisma),
    new ModerationAppealsService(prisma, targets),
  );
}
