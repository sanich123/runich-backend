type PhotoUploadFixture = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

export function makePhotoUpload(overrides: Partial<PhotoUploadFixture> = {}) {
  return {
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('photo'),
    ...overrides,
  };
}

type ActivityMediaManifestEntryFixture = {
  mediaId: string;
  role: 'media' | 'thumbnail';
  url?: string;
};

export function makeActivityMediaFixture(overrides: Partial<ActivityMediaManifestEntryFixture> = {}) {
  return { mediaId: 'media-1', role: 'media' as const, ...overrides };
}
