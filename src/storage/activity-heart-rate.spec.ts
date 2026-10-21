import { gzipSync } from 'node:zlib';
import { decodeActivityHeartRateSamples, encodeActivityHeartRateSamples } from './activity-heart-rate';

describe('activity heart-rate storage codec', () => {
  it('encodes compressed samples with a content-addressed activity key and decodes them', async () => {
    const samples = [
      { timestamp: 1_760_000_000_000, beatsPerMinute: 128 },
      { timestamp: 1_760_000_015_000, beatsPerMinute: 142 },
    ];

    const encoded = await encodeActivityHeartRateSamples('user-1', 'activity-1', samples);

    expect(encoded.key).toMatch(/^user-1\/activities\/activity-1\/heart-rate\/heart-rate-v1-[a-f0-9]{64}\.json\.gz$/);
    expect(await decodeActivityHeartRateSamples(encoded.body)).toEqual(samples);
  });

  it.each([[{ version: 2, samples: [] }], [{ version: 1, samples: null }]])(
    'rejects invalid stored heart-rate data',
    async (stored) => {
      const body = gzipSync(Buffer.from(JSON.stringify(stored), 'utf8'));

      await expect(decodeActivityHeartRateSamples(body)).rejects.toThrow('Неизвестный формат данных пульса активности');
    },
  );
});
