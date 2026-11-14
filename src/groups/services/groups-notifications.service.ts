import { Injectable } from '@nestjs/common';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { notifyGroupMembers } from './groups-notifications.utils';
import type { GroupMembersNotification } from './groups-notifications.utils';

@Injectable()
export class GroupsNotificationsService {
  async notifyGroupMembers(transaction: PrismaService, notification: GroupMembersNotification) {
    await notifyGroupMembers(transaction, notification);
  }
}
