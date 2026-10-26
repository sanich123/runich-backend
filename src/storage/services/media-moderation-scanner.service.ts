import { Logger } from '@nestjs/common';
import * as nsfwjs from 'nsfwjs';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import sharp from 'sharp';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageService } from './storage.service';
import type { GoogleCloudVisionSafeSearch } from './google-cloud-vision-safe-search';
import {
  MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION,
  MEDIA_MODERATION_MAX_VIDEO_FRAMES,
  MEDIA_MODERATION_MAX_VIDEO_SECONDS,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_VIDEO_SAMPLE_INTERVAL_SECONDS,
} from './media-moderation-thresholds';
import { mergeMediaModerationScores } from './media-moderation-worker.helpers';
import type { MediaAsset, MediaModerationScanResult } from './media-moderation-worker.types';

import { MODEL_URL } from './media-moderation-scanner.constants';
import type { Prediction } from './media-moderation-scanner.types';
import { execFileAsync } from './media-moderation-scanner.utils';

export class MediaModerationScannerService {
  private readonly logger = new Logger(MediaModerationScannerService.name);
  private model: nsfwjs.NSFWJS | undefined;

  constructor(
    private readonly storage: StorageService,
    private readonly googleCloudVision: GoogleCloudVisionSafeSearch,
  ) {}

  async scan(asset: MediaAsset): Promise<MediaModerationScanResult> {
    const directory = await mkdtemp(join(tmpdir(), 'runich-media-check-'));
    const inputPath = join(directory, asset.contentType.startsWith('video/') ? 'upload-video' : 'upload-image');
    try {
      await this.storage.downloadQuarantineObjectToFile(asset.quarantineKey, inputPath);
      if (asset.contentType.startsWith('video/')) return await this.scanVideo(inputPath, directory);

      if (await this.googleCloudVision.reserveUnit()) {
        try {
          const [scores] = await this.classifyWithGoogleVision([inputPath]);
          return { scores, frameCount: null, modelVersion: MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION };
        } catch (error) {
          this.logGoogleVisionFallback(error);
        }
      }
      const model = await this.getModel();
      return { scores: await this.classify(model, inputPath), frameCount: null };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async scanVideo(inputPath: string, directory: string): Promise<MediaModerationScanResult> {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    const durationSeconds = Number(stdout.trim());
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MEDIA_MODERATION_MAX_VIDEO_SECONDS
    ) {
      throw new Error(`Длительность видео должна быть не более ${MEDIA_MODERATION_MAX_VIDEO_SECONDS} секунд`);
    }

    const framePattern = join(directory, 'frame-%03d.jpg');
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        inputPath,
        '-vf',
        `fps=1/${MEDIA_MODERATION_VIDEO_SAMPLE_INTERVAL_SECONDS}`,
        '-frames:v',
        String(MEDIA_MODERATION_MAX_VIDEO_FRAMES),
        framePattern,
      ],
      { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const frames = (await readdir(directory)).filter((fileName) => /^frame-\d+\.jpg$/.test(fileName)).sort();
    if (!frames.length) throw new Error('Не удалось извлечь кадры видео для проверки');

    const cloudFrames: string[] = [];
    const localFrames: string[] = [];
    for (const frame of frames) {
      const framePath = join(directory, frame);
      if (await this.googleCloudVision.reserveUnit()) cloudFrames.push(framePath);
      else localFrames.push(framePath);
    }

    const scores: Record<string, number> = {};
    const modelVersions: string[] = [];
    if (cloudFrames.length) {
      try {
        for (const frameScores of await this.classifyWithGoogleVision(cloudFrames)) {
          mergeMediaModerationScores(scores, frameScores);
        }
        modelVersions.push(MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION);
      } catch (error) {
        this.logGoogleVisionFallback(error);
        localFrames.push(...cloudFrames);
      }
    }
    if (localFrames.length) {
      const model = await this.getModel();
      for (const frame of localFrames) {
        mergeMediaModerationScores(scores, await this.classify(model, frame));
      }
      modelVersions.push(MEDIA_MODERATION_MODEL_VERSION);
    }

    return {
      scores,
      frameCount: frames.length,
      modelVersion: modelVersions.join('+'),
    };
  }

  private async classifyWithGoogleVision(imagePaths: string[]) {
    const images = await Promise.all(
      imagePaths.map((imagePath) =>
        sharp(imagePath)
          .rotate()
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer(),
      ),
    );
    return this.googleCloudVision.classifyImages(images);
  }

  private async classify(model: nsfwjs.NSFWJS, imagePath: string) {
    const { data, info } = await sharp(imagePath)
      .rotate()
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels]);
    try {
      const predictions = (await model.classify(tensor)) as Prediction[];
      return Object.fromEntries(predictions.map(({ className, probability }) => [className, probability]));
    } finally {
      tensor.dispose();
    }
  }

  private async getModel() {
    if (this.model) return this.model;
    await tf.setBackend('cpu');
    await tf.ready();
    this.model = await this.loadModel();
    return this.model;
  }

  private async loadModel() {
    return await nsfwjs.load(MODEL_URL);
  }

  private logGoogleVisionFallback(error: unknown) {
    const errorName = error instanceof Error ? error.name : 'unknown error';
    this.logger.warn(`Google Cloud Vision failed; using NSFWJS fallback (${errorName})`);
  }
}
