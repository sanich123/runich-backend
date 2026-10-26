import 'dotenv/config';
import AdmZip from 'adm-zip';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';
import { mapActivitiesWithCoordinates } from 'src/common/parsers/map-activities-with-coordinates';
import { parseCsvFileIntoArray } from 'src/common/parsers/parse-csv';
import { unzipTransferArchive } from 'src/common/parsers/unzip-archive';
import { encodeActivityRoute } from 'src/storage/activity-route';
import { StorageService } from 'src/storage/services/storage.service';
import type { LoadTestActivityAsset, LoadTestAssetManifest } from 'src/load-test/load-test.types';

const PHOTO_VARIANT_COUNT = 25;
const ACTIVITY_TEMPLATE_COUNT = 100;
const DEFAULT_ARCHIVE = '/Users/sanich123/Desktop/export_46803668.zip';
const DEFAULT_ASSET_VERSION = 'stage-feed-v1';

async function main() {
  const archivePath = resolve(process.argv[2] ?? DEFAULT_ARCHIVE);
  const assetVersion = process.argv[3] ?? DEFAULT_ASSET_VERSION;
  const dryRun = process.argv[4] === '--dry-run';
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(assetVersion)) {
    throw new Error('Версия load-test assets должна содержать только a-z, 0-9, _ или -');
  }

  const storage = new StorageService();
  const prefix = `load-test/${assetVersion}`;
  const workDirectory = await mkdtemp(join('/tmp', 'runich-load-test-'));

  try {
    const zip = new AdmZip(archivePath);
    const photoEntries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && /\.(jpg|jpeg|png)$/i.test(entry.entryName));
    if (!photoEntries.length) throw new Error('В архиве не найдены изображения');

    const photoVariants: Buffer[] = [];
    for (let index = 0; index < PHOTO_VARIANT_COUNT; index += 1) {
      const source = photoEntries[index % photoEntries.length];
      photoVariants.push(await makePhotoVariant(source.getData(), index));
    }

    await unzipTransferArchive(archivePath, workDirectory);
    const records = await parseCsvFileIntoArray(workDirectory);
    const candidates = records
      .filter((record) => /\.gpx(\.gz)?$/i.test(String(record.Filename ?? '').trim()))
      .slice(0, ACTIVITY_TEMPLATE_COUNT + 20);
    if (candidates.length < ACTIVITY_TEMPLATE_COUNT) {
      throw new Error(`В архиве найдено только ${candidates.length} подходящих активностей`);
    }

    const mappedActivities = await mapActivitiesWithCoordinates({
      parsedActivities: candidates,
      userId: '00000000-0000-4000-8000-000000000000',
      profileId: '00000000-0000-4000-8000-000000000001',
      migrationDirectory: workDirectory,
    });
    if (mappedActivities.length < ACTIVITY_TEMPLATE_COUNT) {
      throw new Error(`Удалось обработать только ${mappedActivities.length} из ${ACTIVITY_TEMPLATE_COUNT} активностей`);
    }

    const activities: LoadTestActivityAsset[] = [];
    const routeAssets: Array<{ key: string; body: Buffer }> = [];
    for (let index = 0; index < ACTIVITY_TEMPLATE_COUNT; index += 1) {
      const activity = mappedActivities[index];
      const route = await encodeActivityRoute(activity.locations ?? []);
      const routeKey = `${prefix}/routes/route-${String(index + 1).padStart(3, '0')}.json.gz`;
      routeAssets.push({ key: routeKey, body: route.body });
      activities.push({
        sourceActivityId: activity.sourceActivityId,
        title: activity.title ?? null,
        sport: activity.sport,
        description: activity.description ?? null,
        distance: activity.distance,
        duration: activity.duration,
        speed: activity.speed,
        date: activity.date ?? new Date(0).toISOString(),
        kilometresSplit: activity.kilometresSplit ?? null,
        route: { key: routeKey, ...route.metadata },
      });
    }

    const photos = [];
    for (let index = 0; index < photoVariants.length; index += 1) {
      const key = `${prefix}/photos/photo-${String(index + 1).padStart(2, '0')}.webp`;
      const url = dryRun
        ? storage.getPublicUrl(key)
        : (await storage.uploadObject(key, photoVariants[index], 'image/webp', 'public, max-age=31536000, immutable'))
            .url;
      photos.push({ url, thumbnail: url });
    }
    for (const route of routeAssets) {
      if (!dryRun) await storage.uploadObject(route.key, route.body, 'application/json', 'private, no-store');
    }

    const manifest: LoadTestAssetManifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      photos,
      activities,
    };
    const manifestKey = `${prefix}/manifest.json`;
    if (!dryRun) {
      await storage.uploadObject(
        manifestKey,
        Buffer.from(JSON.stringify(manifest), 'utf8'),
        'application/json',
        'private, no-store',
      );
    }

    console.log(
      JSON.stringify(
        {
          manifestKey,
          dryRun,
          photoCount: photos.length,
          activityTemplateCount: activities.length,
          sourcePhotoCount: photoEntries.length,
          sourceArchive: basename(archivePath),
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function makePhotoVariant(input: Buffer, index: number) {
  const rotation = (index % 4) * 90;
  const brightness = 0.9 + (index % 5) * 0.05;
  const saturation = 0.9 + (index % 4) * 0.08;
  const pipeline = sharp(input)
    .rotate(rotation)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .modulate({ brightness, saturation });
  if (index % 2 === 1) pipeline.flop();
  return await pipeline.webp({ quality: 82 }).toBuffer();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
