import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';

const originalAppEnvironment = process.env.APP_ENV;
const originalApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
const originalFetch = globalThis.fetch;
process.env.APP_ENV = 'production';
process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-test-key';

const { GoogleCloudVisionSafeSearch } = await import('../google-cloud-vision-safe-search');

const queryRaw = asyncMock();
const vision = new GoogleCloudVisionSafeSearch({ $queryRaw: queryRaw } as never);
const fetchMock = jest.fn<typeof fetch>();

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

globalThis.fetch = fetchMock as unknown as typeof fetch;

afterAll(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironment('APP_ENV', originalAppEnvironment);
  restoreEnvironment('GOOGLE_CLOUD_VISION_API_KEY', originalApiKey);
});

beforeEach(() => {
  process.env.APP_ENV = 'production';
  process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-test-key';
  queryRaw.mockReset();
  fetchMock.mockReset();
});

describe('GoogleCloudVisionSafeSearch', () => {
  it('reserves one monthly unit atomically and returns false when the quota is full', async () => {
    queryRaw.mockResolvedValueOnce([{ used_units: 1 }]).mockResolvedValueOnce([]);

    await expect(vision.reserveUnit()).resolves.toBe(true);
    await expect(vision.reserveUnit()).resolves.toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('does not reserve units outside production or without an API key', async () => {
    process.env.APP_ENV = 'stage';
    await expect(vision.reserveUnit()).resolves.toBe(false);

    process.env.APP_ENV = 'production';
    delete process.env.GOOGLE_CLOUD_VISION_API_KEY;
    await expect(vision.reserveUnit()).resolves.toBe(false);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('classifies images and maps SafeSearch likelihoods to scores', async () => {
    fetchMock.mockResolvedValue(
      response({
        responses: [
          {
            safeSearchAnnotation: {
              adult: 'LIKELY',
              spoof: 'UNLIKELY',
              medical: 'POSSIBLE',
              violence: 'VERY_LIKELY',
              racy: 'POSSIBLE',
            },
          },
          { safeSearchAnnotation: { adult: 'UNRECOGNIZED', racy: 'UNRECOGNIZED' } },
          { safeSearchAnnotation: {} },
        ],
      }),
    );

    await expect(
      vision.classifyImages([Buffer.from('first'), Buffer.from('second'), Buffer.from('third')]),
    ).resolves.toEqual([
      { Porn: 0.75, Spoof: 0.1, Medical: 0.4, Violence: 0.95, Sexy: 0.4 },
      { Porn: 0, Spoof: 0, Medical: 0, Violence: 0, Sexy: 0 },
      { Porn: 0, Spoof: 0, Medical: 0, Violence: 0, Sexy: 0 },
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).searchParams.get('key')).toBe('vision-test-key');
    expect(init).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String(init?.body)).requests).toHaveLength(3);
  });

  it('rejects calls without an API key and non-success HTTP responses', async () => {
    delete process.env.GOOGLE_CLOUD_VISION_API_KEY;
    await expect(vision.classifyImages([Buffer.from('image')])).rejects.toThrow(
      'Google Cloud Vision API key is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-test-key';
    fetchMock.mockResolvedValue(response({}, 503));
    await expect(vision.classifyImages([Buffer.from('image')])).rejects.toThrow(
      'Google Cloud Vision returned HTTP 503',
    );
  });

  it.each([
    ['top-level error', { error: { message: 'request rejected' } }, 'incomplete SafeSearch response'],
    ['missing responses', {}, 'incomplete SafeSearch response'],
    ['wrong response count', { responses: [] }, 'incomplete SafeSearch response'],
    ['image error', { responses: [{ error: { message: 'image rejected' } }] }, 'SafeSearch detection failed'],
    ['missing annotation', { responses: [{}] }, 'SafeSearch detection failed'],
  ])('rejects malformed Vision response: %s', async (_label, payload, message) => {
    fetchMock.mockResolvedValue(response(payload));
    await expect(vision.classifyImages([Buffer.from('image')])).rejects.toThrow(message);
  });
});
