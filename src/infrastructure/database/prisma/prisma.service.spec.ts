import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('connects during module initialization when mock seeding is disabled', async () => {
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const on = jest.spyOn(service, '$on').mockImplementation(() => service as never);
    const originalSeedFlag = process.env.SEED_MOCK_DATA;
    delete process.env.SEED_MOCK_DATA;

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledTimes(4);

    if (originalSeedFlag === undefined) delete process.env.SEED_MOCK_DATA;
    else process.env.SEED_MOCK_DATA = originalSeedFlag;
  });

  it('propagates connection and disconnection failures', async () => {
    const connectError = new Error('connect failed');
    jest.spyOn(service, '$connect').mockRejectedValue(connectError);
    await expect(service.onModuleInit()).rejects.toBe(connectError);

    const disconnectError = new Error('disconnect failed');
    jest.spyOn(service, '$disconnect').mockRejectedValue(disconnectError);
    await expect(service.onModuleDestroy()).rejects.toBe(disconnectError);
  });

  it('disconnects during module destruction', async () => {
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
