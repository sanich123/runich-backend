import { Inject, Injectable } from '@nestjs/common';
import { isUniqueConstraintError } from 'src/common/utils/database-errors';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { CurrentSubscriptionResponseDto, SubscriptionStatus } from './subscription.dto';

const DEFAULT_ANNUAL_PREMIUM_EMAILS = new Set(['runich.app@yandex.ru', 'varon-in@yandex.ru']);
const DEFAULT_ANNUAL_PRODUCT_ID = 'complimentary-annual-premium';

interface SubscriptionRecord {
  provider: string;
  productId: string | null;
  status: string;
  startsAt: Date | string;
  expiresAt: Date | string | null;
  cancelAtPeriodEnd: boolean;
}

function asDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class SubscriptionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCurrentSubscription(userId: string): Promise<CurrentSubscriptionResponseDto> {
    await this.ensureDefaultAnnualSubscription(userId);

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
        isPremium: false,
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
    const isPremium = record === current;
    const status: SubscriptionStatus = isPremium
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
      isPremium,
      status,
      provider: record.provider,
      productId: record.productId,
      startsAt: startsAtDate?.toISOString() ?? null,
      expiresAt: expiresAtDate?.toISOString() ?? null,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    };
  }

  private async ensureDefaultAnnualSubscription(userId: string) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailConfirmedAt: true },
    })) as { email: string; emailConfirmedAt: Date | string | null } | null;
    const email = user?.email.trim().toLowerCase();
    if (!email || !user?.emailConfirmedAt || !DEFAULT_ANNUAL_PREMIUM_EMAILS.has(email)) return;

    const providerSubscriptionId = `complimentary-annual:${userId}`;
    const where = { provider_providerSubscriptionId: { provider: 'manual', providerSubscriptionId } };
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);

    try {
      await this.prisma.subscription.upsert({
        where,
        update: {},
        create: {
          userId,
          provider: 'manual',
          providerSubscriptionId,
          productId: DEFAULT_ANNUAL_PRODUCT_ID,
          status: 'active',
          startsAt,
          expiresAt,
          cancelAtPeriodEnd: false,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      await this.prisma.subscription.findUnique({ where, select: { id: true } });
    }
  }

  async hasPremiumSubscription(userId: string) {
    return (await this.getCurrentSubscription(userId)).isPremium;
  }
}
