import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
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
    const originalSeedFlag = process.env.SEED_MOCK_DATA;
    delete process.env.SEED_MOCK_DATA;

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(1);

    if (originalSeedFlag === undefined) delete process.env.SEED_MOCK_DATA;
    else process.env.SEED_MOCK_DATA = originalSeedFlag;
  });

  it('propagates connection and disconnection failures', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const connectError = new Error('connect failed');
    jest.spyOn(service, '$connect').mockRejectedValue(connectError);
    await expect(service.onModuleInit()).rejects.toBe(connectError);
    expect(loggerError).toHaveBeenCalledWith('Не удалось подключиться к базе данных', connectError.stack);

    const disconnectError = new Error('disconnect failed');
    jest.spyOn(service, '$disconnect').mockRejectedValue(disconnectError);
    await expect(service.onModuleDestroy()).rejects.toBe(disconnectError);
    expect(loggerError).toHaveBeenCalledWith('Не удалось отключиться от базы данных', disconnectError.stack);
    loggerError.mockRestore();
  });

  it('disconnects during module destruction', async () => {
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
