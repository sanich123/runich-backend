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
    user: { findUnique: asyncMock() },
    subscription: { findMany: asyncMock(), findUnique: asyncMock(), upsert: asyncMock() },
  };
  let service: SubscriptionService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.subscription.findMany.mockResolvedValue([]);
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscription.upsert.mockResolvedValue({});
    service = new SubscriptionService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the empty subscription response when the user has no records', async () => {
    await expect(service.getCurrentSubscription('user-1')).resolves.toEqual({
      userId: 'user-1',
      isPremium: false,
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

    expect(result).toEqual(expect.objectContaining({ isPremium: false, status }));
  });

  it('skips an ineligible latest record and selects the current eligible subscription', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      subscription({ status: 'pending', startsAt: FUTURE, productId: 'future' }),
      subscription({ status: 'active', startsAt: '2026-09-28T11:00:00.000Z', expiresAt: null, productId: 'current' }),
    ]);

    const result = await service.getCurrentSubscription('user-1');

    expect(result).toEqual(expect.objectContaining({ isPremium: true, productId: 'current', status: 'active' }));
  });

  it('does not grant premium when the status or start time makes a record ineligible', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      subscription({ status: 'pending', startsAt: PAST, expiresAt: null }),
    ]);

    await expect(service.hasPremiumSubscription('user-1')).resolves.toBe(false);
  });

  it('creates the complimentary subscription for a confirmed allowlisted email', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      email: '  RUNICH.APP@YANDEX.RU ',
      emailConfirmedAt: PAST,
    });

    await service.getCurrentSubscription('user-1');

    expect(prisma.subscription.upsert).toHaveBeenCalledWith({
      where: {
        provider_providerSubscriptionId: { provider: 'manual', providerSubscriptionId: 'complimentary-annual:user-1' },
      },
      update: {},
      create: expect.objectContaining({
        userId: 'user-1',
        provider: 'manual',
        providerSubscriptionId: 'complimentary-annual:user-1',
        productId: 'complimentary-annual-premium',
        status: 'active',
        cancelAtPeriodEnd: false,
        startsAt: NOW,
        expiresAt: new Date('2027-09-28T12:00:00.000Z'),
      }),
    });
  });

  it.each([
    ['unknown address', { email: 'other@example.com', emailConfirmedAt: PAST }],
    ['unconfirmed address', { email: 'runich.app@yandex.ru', emailConfirmedAt: null }],
    ['blank address', { email: '   ', emailConfirmedAt: PAST }],
    ['missing user', null],
  ])('does not create a complimentary subscription for an %s', async (_label, user) => {
    prisma.user.findUnique.mockResolvedValueOnce(user);

    await service.getCurrentSubscription('user-1');

    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it('looks up the existing complimentary record after a unique-key race', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ email: 'varon-in@yandex.ru', emailConfirmedAt: PAST });
    prisma.subscription.upsert.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'P2002' }));

    await service.getCurrentSubscription('user-1');

    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerSubscriptionId: { provider: 'manual', providerSubscriptionId: 'complimentary-annual:user-1' },
      },
      select: { id: true },
    });
  });

  it('rethrows non-unique failures while creating a complimentary subscription', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ email: 'varon-in@yandex.ru', emailConfirmedAt: PAST });
    prisma.subscription.upsert.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.getCurrentSubscription('user-1')).rejects.toThrow('database unavailable');
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });
});
