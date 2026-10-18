import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { SportsLib } from '@ardentcode/sports-lib';
import { DOMParser } from 'xmldom-qsa';
import { MAX_ACTIVITY_HEART_RATE_SAMPLES } from 'src/common/constants';
import type { ActivityHeartRateSampleObject } from 'src/activity/activity.dto';
import { getHeartRateStatistics } from 'src/activity/heart-rate.utils';
import { resolveMigrationPath } from './migration-path';

const logger = new Logger('HeartRateParser');
const HEART_RATE_STREAM = 'Heart Rate';

type HeartRateStatistics = ReturnType<typeof getHeartRateStatistics>;

export type ParsedHeartRate = {
  samples: ActivityHeartRateSampleObject[];
  statistics?: HeartRateStatistics;
};

function limitHeartRateSamples(samples: ActivityHeartRateSampleObject[]) {
  if (samples.length <= MAX_ACTIVITY_HEART_RATE_SAMPLES) return samples;

  const lastIndex = samples.length - 1;
  return Array.from(
    { length: MAX_ACTIVITY_HEART_RATE_SAMPLES },
    (_, index) => samples[Math.round((index * lastIndex) / (MAX_ACTIVITY_HEART_RATE_SAMPLES - 1))],
  );
}

function parseXml(value: string) {
  return new DOMParser().parseFromString(value, 'text/xml');
}

export async function getHeartRateFromFile(filePath: string, migrationDirectory: string): Promise<ParsedHeartRate> {
  try {
    const inputFilePath = resolveMigrationPath(migrationDirectory, filePath);
    const extension = extname(filePath).toLowerCase();
    let event: Awaited<ReturnType<typeof SportsLib.importFromFit>>;

    if (extension === '.fit') {
      const buffer = await readFile(inputFilePath);
      const fileBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      event = await SportsLib.importFromFit(fileBuffer as ArrayBuffer);
    } else if (extension === '.gpx') {
      const gpx = await readFile(inputFilePath, { encoding: 'utf-8' });
      event = await SportsLib.importFromGPX(gpx, parseXml);
    } else if (extension === '.tcx') {
      const tcx = await readFile(inputFilePath, { encoding: 'utf-8' });
      event = await SportsLib.importFromTCX(parseXml(tcx));
    } else {
      return { samples: [] };
    }

    const samples = event
      .getActivities()
      .flatMap((activity) => {
        const heartRateStream = activity.getAllStreams().find((stream) => stream.type === HEART_RATE_STREAM);
        if (!heartRateStream) return [];

        return heartRateStream
          .getStreamDataByTime(activity.startDate, true)
          .flatMap(({ time, value }) =>
            Number.isFinite(time) && time >= 0 && typeof value === 'number' && value >= 1 && value <= 300
              ? [{ timestamp: time, beatsPerMinute: Math.round(value) }]
              : [],
          );
      })
      .sort((first, second) => first.timestamp - second.timestamp);

    if (!samples.length) return { samples: [] };

    return {
      samples: limitHeartRateSamples(samples),
      statistics: getHeartRateStatistics(samples),
    };
  } catch (error) {
    logger.warn(
      `Не удалось обработать данные пульса ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { samples: [] };
  }
}
