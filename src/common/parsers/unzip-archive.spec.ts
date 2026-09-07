import AdmZip from 'adm-zip';
import { jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipTransferArchive } from './unzip-archive';

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entryName: string, content: Buffer) {
  const name = Buffer.from(entryName, 'utf8');
  const checksum = crc32(content);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(name.length, 26);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);

  const centralDirectory = Buffer.concat([centralHeader, name]);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localHeader.length + name.length + content.length, 16);

  return Buffer.concat([localHeader, name, content, centralDirectory, endOfCentralDirectory]);
}

describe('unzipTransferArchive', () => {
  let root: string;
  let cwdSpy: jest.SpiedFunction<typeof process.cwd>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'runich-zip-'));
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(root);
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('rejects traversal entries before extracting anything', async () => {
    const archivePath = join(root, 'malicious.zip');
    await writeFile(archivePath, createStoredZip('../outside.txt', Buffer.from('must not be written')));

    await expect(unzipTransferArchive(archivePath)).rejects.toThrow('Недопустимый путь');
    expect(existsSync(join(root, 'outside.txt'))).toBe(false);
    expect(existsSync(join(root, 'dist', 'migration'))).toBe(false);
  });

  it('extracts safe entries inside the migration directory', async () => {
    const archivePath = join(root, 'safe.zip');
    const zip = new AdmZip();
    zip.addFile('activities.csv', Buffer.from('Activity ID\nactivity-1\n'));
    zip.writeZip(archivePath);

    await unzipTransferArchive(archivePath);

    await expect(readFile(join(root, 'dist', 'migration', 'activities.csv'), 'utf8')).resolves.toContain('activity-1');
  });

  it('extracts into an isolated worker directory when one is provided', async () => {
    const archivePath = join(root, 'safe-worker.zip');
    const destination = join(root, 'worker', 'job-1');
    const zip = new AdmZip();
    zip.addFile('activities.csv', Buffer.from('Activity ID\nactivity-1\n'));
    zip.writeZip(archivePath);

    await unzipTransferArchive(archivePath, destination);

    await expect(readFile(join(destination, 'activities.csv'), 'utf8')).resolves.toContain('activity-1');
  });

  it('rejects archives with too many entries before extraction', async () => {
    const archivePath = join(root, 'oversized-entry-count.zip');
    const zip = new AdmZip();
    for (let index = 0; index <= 5_000; index += 1) {
      zip.addFile(`entry-${index}.txt`, Buffer.from('x'));
    }
    zip.writeZip(archivePath);

    await expect(unzipTransferArchive(archivePath)).rejects.toThrow('слишком много файлов');
    expect(existsSync(join(root, 'dist', 'migration'))).toBe(false);
  });
});
