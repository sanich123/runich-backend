import { isZipUpload, UPLOAD_LIMITS } from '../upload-limits';

describe('upload limits', () => {
  it('accepts ZIP archives case-insensitively and rejects other extensions', () => {
    expect(isZipUpload('strava-export.zip')).toBe(true);
    expect(isZipUpload('STRAVA-EXPORT.ZIP')).toBe(true);
    expect(isZipUpload('strava-export.tar.gz')).toBe(false);
    expect(isZipUpload('strava-export.zip.exe')).toBe(false);
  });

  it('keeps bounded limits for media and archive uploads', () => {
    expect(UPLOAD_LIMITS.photoBytes).toBe(15 * 1024 * 1024);
    expect(UPLOAD_LIMITS.migrationArchiveBytes).toBe(150 * 1024 * 1024);
    expect(UPLOAD_LIMITS.migrationArchiveEntries).toBe(5_000);
    expect(UPLOAD_LIMITS.migrationArchiveUncompressedBytes).toBe(500 * 1024 * 1024);
  });
});
