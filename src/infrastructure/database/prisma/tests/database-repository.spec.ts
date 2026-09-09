import { jest } from '@jest/globals';
import { ModelRepository } from '../database-repository';

describe('ModelRepository', () => {
  it('writes createMany rows in one parameterized insert', async () => {
    const execute = jest
      .fn<(plan: unknown) => Promise<{ affectedRows: number }>>()
      .mockResolvedValue({ affectedRows: 2 });
    const client = {
      orm: { public: { Activity: {} } },
      runtime: () => ({ execute }),
    };
    const repository = new ModelRepository(client as never, 'Activity');

    await expect(
      repository.createMany({
        data: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            userId: '00000000-0000-4000-8000-000000000002',
            profileId: '00000000-0000-4000-8000-000000000003',
            distance: 1,
            duration: 60,
            speed: 1,
            sport: 'run',
            source: 'strava',
            sourceActivityId: 'source-1',
            locations: [{ latitude: 55.75, longitude: 37.61 }],
          },
          {
            id: '00000000-0000-4000-8000-000000000004',
            userId: '00000000-0000-4000-8000-000000000002',
            profileId: '00000000-0000-4000-8000-000000000003',
            distance: 2,
            duration: 120,
            speed: 1,
            sport: 'run',
            source: 'strava',
            sourceActivityId: 'source-2',
            locations: [{ latitude: 55.76, longitude: 37.62 }],
          },
        ],
        skipDuplicates: true,
      }),
    ).resolves.toEqual({ count: 2 });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('ON CONFLICT DO NOTHING');
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('::jsonb');
  });

  it('does not execute a query for an empty createMany input', async () => {
    const execute = jest.fn();
    const client = {
      orm: { public: { Activity: {} } },
      runtime: () => ({ execute }),
    };
    const repository = new ModelRepository(client as never, 'Activity');

    await expect(repository.createMany({ data: [] })).resolves.toEqual({ count: 0 });
    expect(execute).not.toHaveBeenCalled();
  });
});
