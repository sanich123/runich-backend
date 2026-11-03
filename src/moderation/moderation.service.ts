import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import type { ModerationActionDto, ModerationAppealDecisionDto, SubmitContentReportDto } from './dto/moderation.dto';
import { UserBlocksService } from './services/user-blocks.service';
import { ModerationReportsService } from './services/moderation-reports.service';
import { ModerationAppealsService } from './services/moderation-appeals.service';
import { ModerationTargetsService } from './services/moderation-targets.service';

@Injectable()
export class ModerationService {
  private readonly targets: ModerationTargetsService;
  private readonly reports: ModerationReportsService;
  private readonly blocks: UserBlocksService;
  private readonly appeals: ModerationAppealsService;

  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(StorageService) storage: StorageService,
    @Optional() @Inject(ModerationTargetsService) targets?: ModerationTargetsService,
    @Optional() @Inject(ModerationReportsService) reports?: ModerationReportsService,
    @Optional() @Inject(UserBlocksService) blocks?: UserBlocksService,
    @Optional() @Inject(ModerationAppealsService) appeals?: ModerationAppealsService,
  ) {
    this.targets = targets ?? new ModerationTargetsService(prisma);
    this.reports = reports ?? new ModerationReportsService(prisma, storage, this.targets);
    this.blocks = blocks ?? new UserBlocksService(prisma);
    this.appeals = appeals ?? new ModerationAppealsService(prisma, this.targets);
  }

  async submitReport(reporterId: string, request: SubmitContentReportDto) {
    return this.reports.submitReport(reporterId, request);
  }

  async getReportQueue(status?: string, take = 50) {
    return this.reports.getReportQueue(status, take);
  }

  async getReportDetails(reportId: string) {
    return this.reports.getReportDetails(reportId);
  }

  async applyAction(reportId: string, moderatorId: string, request: ModerationActionDto) {
    return this.reports.applyAction(reportId, moderatorId, request);
  }

  async blockUser(blockerId: string, blockedId: string) {
    return this.blocks.blockUser(blockerId, blockedId);
  }

  async unblockUser(blockerId: string, blockedId: string) {
    return this.blocks.unblockUser(blockerId, blockedId);
  }

  async getBlockedUsers(blockerId: string) {
    return this.blocks.getBlockedUsers(blockerId);
  }

  async submitAppeal(reportId: string, appellantId: string, reason: string) {
    return this.appeals.submitAppeal(reportId, appellantId, reason);
  }

  async getAppealQueue(take = 50) {
    return this.appeals.getAppealQueue(take);
  }

  async decideAppeal(appealId: string, moderatorId: string, request: ModerationAppealDecisionDto) {
    return this.appeals.decideAppeal(appealId, moderatorId, request);
  }
}
