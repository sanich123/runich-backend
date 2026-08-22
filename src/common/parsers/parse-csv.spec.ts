import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import { parseCsvFileIntoArray } from './parse-csv';

describe('parseCsvFileIntoArray', () => {
  let root: string;
  let cwdSpy: jest.SpiedFunction<typeof process.cwd>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'runich-csv-'));
    await mkdir(join(root, 'dist', 'migration'), { recursive: true });
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('reads CSV rows with headers', async () => {
    await writeFile(
      join(root, 'dist', 'migration', 'activities.csv'),
      'Activity ID,Filename,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance\n' +
        'a1,run.gpx,2026-08-22,Run,Run,,300,5\n',
    );

    await expect(parseCsvFileIntoArray()).resolves.toEqual([
      {
        'Activity ID': 'a1',
        Filename: 'run.gpx',
        'Activity Date': '2026-08-22',
        'Activity Name': 'Run',
        'Activity Type': 'Run',
        'Activity Description': '',
        'Elapsed Time': '300',
        Distance: '5',
      },
    ]);
  });

  it('rejects when the migration CSV is absent', async () => {
    await expect(parseCsvFileIntoArray()).rejects.toThrow('Файл CSV не найден');
  });
});
