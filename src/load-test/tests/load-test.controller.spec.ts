import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { LoadTestController } from '../load-test.controller';
import { LoadTestSeedService } from '../load-test.service';
import { asyncMock } from 'src/tests/helpers';

describe('LoadTestController', () => {
  const serviceMock = {
    enqueue: asyncMock(),
    getJob: asyncMock(),
    remove: asyncMock(),
  };
  const service = serviceMock as unknown as LoadTestSeedService;
  let controller: LoadTestController;

  beforeEach(() => {
    process.env.APP_ENV = 'stage';
    process.env.LOAD_TEST_SEED_TOKEN = 'stage-load-test-token';
    controller = new LoadTestController(service);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.LOAD_TEST_SEED_TOKEN;
  });

  it('requires the protected token before enqueueing a job', async () => {
    await expect(controller.enqueue(undefined, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(serviceMock.enqueue).not.toHaveBeenCalled();
  });

  it('does not expose the endpoints in production', async () => {
    process.env.APP_ENV = 'production';

    await expect(controller.getJob('stage-feed-v1', 'token')).rejects.toBeInstanceOf(NotFoundException);
    expect(serviceMock.getJob).not.toHaveBeenCalled();
  });

  it('passes an authorized request to the seed service', async () => {
    const input = { runId: 'stage-feed-v1' };
    serviceMock.enqueue.mockResolvedValue({ status: 'queued' });

    await expect(controller.enqueue('stage-load-test-token', input)).resolves.toEqual({ status: 'queued' });
    expect(serviceMock.enqueue).toHaveBeenCalledWith(input);
  });

  it('requires the token to be configured', async () => {
    delete process.env.LOAD_TEST_SEED_TOKEN;

    await expect(controller.getJob('stage-feed-v1', 'token')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
