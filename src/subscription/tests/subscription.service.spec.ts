import { jest } from '@jest/globals';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { asyncMock } from 'src/tests/helpers';
import { SubscriptionService } from '../subscription.service';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const PAST = new Date('2026-09-27T12:00:00.000Z');
const FUTURE = new Date('2026-09-29T12:00:00.000Z');

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'app-store',
    productId: 'annual-premium',
    status: 'active',
    startsAt: PAST,
    expiresAt: FUTURE,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe('SubscriptionService', () => {
  const prisma = {
    subscription: { findMany: asyncMock() },
  };
  let service: SubscriptionService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    prisma.subscription.findMany.mockResolvedValue([]);
    service = new SubscriptionService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('grants full access when the user has no subscription records', async () => {
    await expect(service.getCurrentSubscription('user-1')).resolves.toEqual({
      userId: 'user-1',
      isPremium: true,
      status: 'none',
      provider: null,
      productId: null,
      startsAt: null,
      expiresAt: null,
      cancelAtPeriodEnd: false,
    });
  });

  it('returns an active subscription and serializes Date values', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      subscription({ startsAt: PAST, expiresAt: FUTURE, cancelAtPeriodEnd: true }),
    ]);

    await expect(service.getCurrentSubscription('user-1')).resolves.toEqual({
      userId: 'user-1',
      isPremium: true,
      status: 'active',
      provider: 'app-store',
      productId: 'annual-premium',
      startsAt: PAST.toISOString(),
      expiresAt: FUTURE.toISOString(),
      cancelAtPeriodEnd: true,
    });
  });

  it('recognizes a current cancelled subscription without an expiry', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      subscription({ status: 'cancelled', startsAt: PAST, expiresAt: null }),
    ]);

    const result = await service.getCurrentSubscription('user-1');

    expect(result).toEqual(expect.objectContaining({ isPremium: true, status: 'cancelled', expiresAt: null }));
  });

  it.each([
    ['future start', subscription({ startsAt: FUTURE }), 'pending'],
    ['pending status', subscription({ status: 'pending', startsAt: PAST }), 'pending'],
    ['expired active record', subscription({ startsAt: PAST, expiresAt: PAST }), 'expired'],
    ['expired cancelled record', subscription({ status: 'cancelled', startsAt: PAST, expiresAt: PAST }), 'expired'],
    ['unknown status', subscription({ status: 'paused', startsAt: PAST, expiresAt: null }), 'expired'],
    ['invalid start date', subscription({ startsAt: 'invalid-date', expiresAt: null }), 'expired'],
    [
      'invalid expiry date on cancelled record',
      subscription({ status: 'cancelled', expiresAt: 'invalid-date' }),
      'cancelled',
    ],
  ])('maps a non-current %s record to %s', async (_label, record, status) => {
    prisma.subscription.findMany.mockResolvedValueOnce([record]);

    const result = await service.getCurrentSubscription('user-1');

    expect(result).toEqual(expect.objectContaining({ isPremium: true, status }));
  });

  it('skips an ineligible latest record and selects the current eligible subscription', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      subscription({ status: 'pending', startsAt: FUTURE, productId: 'future' }),
      subscription({ status: 'active', startsAt: '2026-09-28T11:00:00.000Z', expiresAt: null, productId: 'current' }),
    ]);

    const result = await service.getCurrentSubscription('user-1');

    expect(result).toEqual(expect.objectContaining({ isPremium: true, productId: 'current', status: 'active' }));
  });

  it('grants feature access without reading billing records', async () => {
    await expect(service.hasPremiumSubscription('user-1')).resolves.toBe(true);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });
});
