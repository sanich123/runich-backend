import { createHash } from 'node:crypto';
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { ActivityHeartRateSampleObject } from 'src/activity/activity.dto';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const ACTIVITY_HEART_RATE_FORMAT_VERSION = 1;

type StoredActivityHeartRate = {
  version: typeof ACTIVITY_HEART_RATE_FORMAT_VERSION;
  samples: ActivityHeartRateSampleObject[];
};

export async function encodeActivityHeartRateSamples(
  userId: string,
  activityId: string,
  samples: ActivityHeartRateSampleObject[],
) {
  const jsonBody = Buffer.from(
    JSON.stringify({ version: ACTIVITY_HEART_RATE_FORMAT_VERSION, samples } satisfies StoredActivityHeartRate),
    'utf8',
  );
  const digest = createHash('sha256').update(jsonBody).digest('hex');
  const body = await gzipAsync(jsonBody);

  return {
    body,
    key: getActivityHeartRateKey(userId, activityId, digest),
  };
}

export async function decodeActivityHeartRateSamples(body: Uint8Array): Promise<ActivityHeartRateSampleObject[]> {
  const parsed = JSON.parse((await gunzipAsync(Buffer.from(body))).toString('utf8')) as StoredActivityHeartRate;
  if (parsed.version !== ACTIVITY_HEART_RATE_FORMAT_VERSION || !Array.isArray(parsed.samples)) {
    throw new Error('Неизвестный формат данных пульса активности');
  }

  return parsed.samples;
}

export function getActivityHeartRateKey(userId: string, activityId: string, digest: string) {
  return `${userId}/activities/${activityId}/heart-rate/heart-rate-v${ACTIVITY_HEART_RATE_FORMAT_VERSION}-${digest}.json.gz`;
}
