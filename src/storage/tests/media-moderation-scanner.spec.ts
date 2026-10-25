import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import * as childProcess from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION,
  MEDIA_MODERATION_MODEL_VERSION,
} from '../media-moderation-thresholds';

type ExecFileCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

let videoDuration = '6';
let shouldCreateFrames = true;
let extractedFramePattern: string | undefined;

const execFileMock = jest.fn((command: string, args: string[], _options: unknown, callback: ExecFileCallback) => {
  if (command === 'ffprobe') {
    callback(null, { stdout: videoDuration, stderr: '' });
    return;
  }

  extractedFramePattern = args.at(-1);
  if (!shouldCreateFrames || !extractedFramePattern) {
    callback(null, { stdout: '', stderr: '' });
    return;
  }

  const frameDirectory = extractedFramePattern.slice(0, extractedFramePattern.lastIndexOf('/'));
  void Promise.all([
    writeFile(join(frameDirectory, 'frame-001.jpg'), Buffer.from('first frame')),
    writeFile(join(frameDirectory, 'frame-002.jpg'), Buffer.from('second frame')),
  ]).then(() => callback(null, { stdout: '', stderr: '' }));
});

await jest.unstable_mockModule('node:child_process', () => ({ ...childProcess, execFile: execFileMock }));

const { MediaModerationScannerService } = await import('../media-moderation-scanner.service');

const queuedAsset = {
  id: 'asset-1',
  ownerId: 'owner-1',
  quarantineKey: 'moderation-quarantine/owner-1/asset-1.mp4',
  contentType: 'video/mp4' as string,
  status: 'queued',
  attempts: 0,
};

type ScannerPrivateMethods = {
  model: unknown;
  getModel: () => Promise<unknown>;
  loadModel: () => Promise<unknown>;
  scan: (asset: typeof queuedAsset) => Promise<{ scores: Record<string, number>; frameCount: number | null }>;
  classify: (model: unknown, imagePath: string) => Promise<Record<string, number>>;
  classifyWithGoogleVision: (imagePaths: string[]) => Promise<Record<string, number>[]>;
};

function createScanner(googleCloudVision = { reserveUnit: async () => false, classifyImages: async () => [] }) {
  const storage = {
    downloadQuarantineObjectToFile: jest.fn(async (_key: string, path: string) =>
      writeFile(path, Buffer.from('video')),
    ),
  };
  const scanner = new MediaModerationScannerService(
    storage as never,
    googleCloudVision as never,
  ) as unknown as ScannerPrivateMethods;
  const getModel = jest.spyOn(scanner, 'getModel').mockResolvedValue({});
  return { scanner, storage, getModel };
}

describe('MediaModerationScannerService video scanner', () => {
  beforeEach(() => {
    videoDuration = '6';
    shouldCreateFrames = true;
    extractedFramePattern = undefined;
    execFileMock.mockClear();
  });

  it('extracts frames, classifies each frame, and retains the highest score per category', async () => {
    const { scanner, storage } = createScanner();
    const classify = jest
      .spyOn(scanner, 'classify')
      .mockResolvedValueOnce({ Porn: 0.2, Drawing: 0.1 })
      .mockResolvedValueOnce({ Porn: 0.9, Drawing: 0.4 });

    await expect(scanner.scan(queuedAsset)).resolves.toEqual({
      scores: { Porn: 0.9, Drawing: 0.4 },
      frameCount: 2,
      modelVersion: 'nsfwjs-five-label-cpu',
    });
    expect(storage.downloadQuarantineObjectToFile).toHaveBeenCalledWith(queuedAsset.quarantineKey, expect.any(String));
    expect(execFileMock.mock.calls.map(([command]) => command)).toEqual(['ffprobe', 'ffmpeg']);
    expect(execFileMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(['-vf', 'fps=1/5', '-frames:v', '12']));
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it('classifies an image locally when Google Vision is unavailable', async () => {
    const imageAsset = { ...queuedAsset, contentType: 'image/webp' };
    const { scanner, getModel } = createScanner();
    const classify = jest.spyOn(scanner, 'classify').mockResolvedValue({ Drawing: 0.8 });

    await expect(scanner.scan(imageAsset)).resolves.toEqual({
      scores: { Drawing: 0.8 },
      frameCount: null,
    });
    expect(getModel).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('uses Google Vision for an image when a monthly unit is available', async () => {
    const imageAsset = { ...queuedAsset, contentType: 'image/webp' };
    const googleCloudVision = { reserveUnit: async () => true, classifyImages: async () => [] };
    const { scanner } = createScanner(googleCloudVision);
    const classifyWithGoogleVision = jest
      .spyOn(scanner, 'classifyWithGoogleVision')
      .mockResolvedValue([{ Porn: 0.75 }]);

    await expect(scanner.scan(imageAsset)).resolves.toEqual({
      scores: { Porn: 0.75 },
      frameCount: null,
      modelVersion: MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION,
    });
    expect(classifyWithGoogleVision).toHaveBeenCalledTimes(1);
  });

  it('falls back to NSFWJS if Google Vision fails for an image', async () => {
    const imageAsset = { ...queuedAsset, contentType: 'image/webp' };
    const googleCloudVision = { reserveUnit: async () => true, classifyImages: async () => [] };
    const { scanner } = createScanner(googleCloudVision);
    const classifyWithGoogleVision = jest.spyOn(scanner, 'classifyWithGoogleVision').mockRejectedValue(new Error());
    const classify = jest.spyOn(scanner, 'classify').mockResolvedValue({ Porn: 0.9 });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(scanner.scan(imageAsset)).resolves.toEqual({
      scores: { Porn: 0.9 },
      frameCount: null,
    });
    expect(classifyWithGoogleVision).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('(Error)'));
    warn.mockRestore();
  });

  it('uses Google Vision and NSFWJS for video frames when the monthly quota runs out mid-video', async () => {
    const googleCloudVision = {
      reserveUnit: jest.fn<() => Promise<boolean>>().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      classifyImages: async () => [],
    };
    const { scanner } = createScanner(googleCloudVision);
    const classifyWithGoogleVision = jest.spyOn(scanner, 'classifyWithGoogleVision').mockResolvedValue([{ Porn: 0.7 }]);
    const classify = jest.spyOn(scanner, 'classify').mockResolvedValue({ Sexy: 0.8 });

    await expect(scanner.scan(queuedAsset)).resolves.toEqual({
      scores: { Porn: 0.7, Sexy: 0.8 },
      frameCount: 2,
      modelVersion: `${MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION}+${MEDIA_MODERATION_MODEL_VERSION}`,
    });
    expect(classifyWithGoogleVision).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('does not initialize NSFWJS when every video frame uses Google Vision', async () => {
    const googleCloudVision = { reserveUnit: async () => true, classifyImages: async () => [] };
    const { scanner, getModel } = createScanner(googleCloudVision);
    jest.spyOn(scanner, 'classifyWithGoogleVision').mockResolvedValue([{ Porn: 0.7 }, { Porn: 0.9 }]);

    await expect(scanner.scan(queuedAsset)).resolves.toEqual({
      scores: { Porn: 0.9 },
      frameCount: 2,
      modelVersion: MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION,
    });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('falls back to NSFWJS for all reserved video frames when Google Vision fails', async () => {
    const googleCloudVision = { reserveUnit: async () => true, classifyImages: async () => [] };
    const { scanner } = createScanner(googleCloudVision);
    jest.spyOn(scanner, 'classifyWithGoogleVision').mockRejectedValue('Vision unavailable');
    const classify = jest.spyOn(scanner, 'classify').mockResolvedValue({ Porn: 0.9 });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(scanner.scan(queuedAsset)).resolves.toEqual({
      scores: { Porn: 0.9 },
      frameCount: 2,
      modelVersion: MEDIA_MODERATION_MODEL_VERSION,
    });
    expect(classify).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('(unknown error)'));
    warn.mockRestore();
  });

  it.each(['NaN', '0', '61'])('rejects a video with invalid or excessive duration %s', async (duration) => {
    videoDuration = duration;
    const { scanner } = createScanner();
    const classify = jest.spyOn(scanner, 'classify');

    await expect(scanner.scan(queuedAsset)).rejects.toThrow('Длительность видео должна быть не более 60 секунд');
    expect(execFileMock.mock.calls.map(([command]) => command)).toEqual(['ffprobe']);
    expect(classify).not.toHaveBeenCalled();
  });

  it('fails closed when ffmpeg cannot extract any frames and reuses the already loaded model', async () => {
    shouldCreateFrames = false;
    const { scanner, getModel } = createScanner();
    const model = { cached: true };
    getModel.mockRestore();
    scanner.model = model;
    await expect(scanner.getModel()).resolves.toBe(model);
    await expect(scanner.scan(queuedAsset)).rejects.toThrow('Не удалось извлечь кадры видео для проверки');
    expect(execFileMock.mock.calls.map(([command]) => command)).toEqual(['ffprobe', 'ffmpeg']);
  });

  it('loads the NSFWJS model once and reuses it for later scans', async () => {
    const { scanner, getModel } = createScanner();
    const model = { classify: jest.fn() };
    getModel.mockRestore();
    const loadModel = jest.spyOn(scanner, 'loadModel').mockResolvedValue(model);

    await expect(scanner.getModel()).resolves.toBe(model);
    await expect(scanner.getModel()).resolves.toBe(model);

    expect(loadModel).toHaveBeenCalledTimes(1);
  });
});
