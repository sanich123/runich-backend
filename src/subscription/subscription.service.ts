import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { CurrentSubscriptionResponseDto, SubscriptionStatus } from './subscription.dto';
import type { SubscriptionRecord } from './subscription.types';
import { asDate } from './subscription.utils';

@Injectable()
export class SubscriptionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCurrentSubscription(userId: string): Promise<CurrentSubscriptionResponseDto> {
    const subscriptions = (await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        provider: true,
        productId: true,
        status: true,
        startsAt: true,
        expiresAt: true,
        cancelAtPeriodEnd: true,
      },
    })) as SubscriptionRecord[];

    const now = Date.now();
    const current = subscriptions.find((subscription) => {
      const startsAt = asDate(subscription.startsAt)?.getTime() ?? Number.POSITIVE_INFINITY;
      const expiresAt = asDate(subscription.expiresAt)?.getTime();
      const hasExpiry = subscription.expiresAt !== null;
      return (
        (subscription.status === 'active' || subscription.status === 'cancelled') &&
        startsAt <= now &&
        (!hasExpiry || (expiresAt !== undefined && expiresAt !== null && expiresAt > now))
      );
    });
    const record = current ?? subscriptions[0];
    if (!record) {
      return {
        userId,
        isPremium: true,
        status: 'none',
        provider: null,
        productId: null,
        startsAt: null,
        expiresAt: null,
        cancelAtPeriodEnd: false,
      };
    }

    const startsAtDate = asDate(record.startsAt);
    const expiresAtDate = asDate(record.expiresAt);
    const startsInFuture = Boolean(startsAtDate && startsAtDate.getTime() > now);
    const hasCurrentSubscription = record === current;
    const status: SubscriptionStatus = hasCurrentSubscription
      ? (record.status as 'active' | 'cancelled')
      : startsInFuture || record.status === 'pending'
        ? 'pending'
        : expiresAtDate && expiresAtDate.getTime() <= now
          ? 'expired'
          : record.status === 'cancelled'
            ? 'cancelled'
            : 'expired';

    return {
      userId,
      isPremium: true,
      status,
      provider: record.provider,
      productId: record.productId,
      startsAt: startsAtDate?.toISOString() ?? null,
      expiresAt: expiresAtDate?.toISOString() ?? null,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    };
  }

  hasPremiumSubscription(userId: string): Promise<boolean> {
    void userId;
    return Promise.resolve(true);
  }
}
