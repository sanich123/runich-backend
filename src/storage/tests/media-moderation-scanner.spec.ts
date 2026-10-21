import { jest } from '@jest/globals';
import * as childProcess from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type ExecFileCallback = (error: Error | null, result?: { stdout: string; stderr: string }) => void;

let videoDuration = '1.5';
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

const { MediaModerationWorkerService } = await import('../media-moderation-worker.service');

const queuedAsset = {
  id: 'asset-1',
  ownerId: 'owner-1',
  quarantineKey: 'moderation-quarantine/owner-1/asset-1.mp4',
  contentType: 'video/mp4',
  status: 'queued',
  attempts: 0,
};

type ScannerPrivateMethods = {
  model: unknown;
  getModel: () => Promise<unknown>;
  loadModel: () => Promise<unknown>;
  scanAsset: (asset: typeof queuedAsset) => Promise<{ scores: Record<string, number>; frameCount: number | null }>;
  classify: (model: unknown, imagePath: string) => Promise<Record<string, number>>;
};

function createScanner() {
  const storage = {
    downloadQuarantineObjectToFile: jest.fn(async (_key: string, path: string) =>
      writeFile(path, Buffer.from('video')),
    ),
  };
  const worker = new MediaModerationWorkerService({} as never, storage as never);
  const scanner = worker as unknown as ScannerPrivateMethods;
  const getModel = jest.spyOn(scanner, 'getModel').mockResolvedValue({});
  return { scanner, storage, getModel };
}

describe('MediaModerationWorkerService video scanner', () => {
  beforeEach(() => {
    videoDuration = '1.5';
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

    await expect(scanner.scanAsset(queuedAsset)).resolves.toEqual({
      scores: { Porn: 0.9, Drawing: 0.4 },
      frameCount: 2,
    });
    expect(storage.downloadQuarantineObjectToFile).toHaveBeenCalledWith(queuedAsset.quarantineKey, expect.any(String));
    expect(execFileMock.mock.calls.map(([command]) => command)).toEqual(['ffprobe', 'ffmpeg']);
    expect(execFileMock.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(['-vf', 'fps=1', '-frames:v', '60']));
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it.each(['NaN', '0', '61'])('rejects a video with invalid or excessive duration %s', async (duration) => {
    videoDuration = duration;
    const { scanner } = createScanner();
    const classify = jest.spyOn(scanner, 'classify');

    await expect(scanner.scanAsset(queuedAsset)).rejects.toThrow('Длительность видео должна быть не более 60 секунд');
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
    await expect(scanner.scanAsset(queuedAsset)).rejects.toThrow('Не удалось извлечь кадры видео для проверки');
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
