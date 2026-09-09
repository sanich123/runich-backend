import { gzipSync } from 'node:zlib';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { ungzipFile } from '../ungzip';

describe('ungzipFile', () => {
  let root: string;
  let cwdSpy: jest.SpiedFunction<typeof process.cwd>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'runich-gzip-'));
    await mkdir(join(root, 'dist', 'migration'), { recursive: true });
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('decompresses a migration file next to its source', async () => {
    await writeFile(join(root, 'dist', 'migration', 'activities.csv.gz'), gzipSync('Activity ID\na1\n'));

    await expect(ungzipFile('activities.csv.gz')).resolves.toBeUndefined();
    await expect(readFile(join(root, 'dist', 'migration', 'activities.csv'), 'utf8')).resolves.toBe(
      'Activity ID\na1\n',
    );
  });

  it('rejects when the compressed source is absent', async () => {
    await expect(ungzipFile('missing.csv.gz')).rejects.toThrow();
  });
});
