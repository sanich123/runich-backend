import { HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import { HealthController } from './health.controller';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

describe('HealthController', () => {
  const queryRaw = jest.fn<() => Promise<unknown>>();
  const prismaService = { $queryRaw: queryRaw } as unknown as PrismaService;
  let controller: HealthController;

  beforeEach(() => {
    queryRaw.mockReset();
    controller = new HealthController(prismaService);
  });

  it('reports liveness without querying the database', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness when the database responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const response = { status: jest.fn() };

    await expect(controller.ready(response as never)).resolves.toEqual({
      status: 'ok',
      checks: { database: 'ok' },
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns service unavailable when the database is down', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));
    const response = { status: jest.fn() };

    await expect(controller.ready(response as never)).resolves.toEqual({
      status: 'not_ready',
      checks: { database: 'failed' },
    });
    expect(response.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
