import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

export type StorageFile = {
  buffer?: Buffer;
  path?: string;
  size?: number;
  originalname: string;
  mimetype: string;
};

export const MEDIA_UPLOAD_SCOPES = ['activity', 'profile', 'feedback'] as const;
export type MediaUploadScope = (typeof MEDIA_UPLOAD_SCOPES)[number];

export const MEDIA_UPLOAD_ROLES = ['media', 'thumbnail'] as const;
export type MediaUploadRole = (typeof MEDIA_UPLOAD_ROLES)[number];

export type MediaUploadManifestEntry = {
  mediaId: string;
  role: MediaUploadRole;
};

export type UploadedPhotoBatch = {
  url: string;
  key: string;
  contentType: string;
  mediaId: string;
  role: MediaUploadRole;
};

export type PhotoUploadOptions = {
  scope?: MediaUploadScope;
  feedbackId?: string;
};

export type StorageSettings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
};

export type CleanupDatabase = Pick<PrismaService, 'mediaCleanupJob'>;

export type ActivityRouteStorageMetadata = {
  key: string;
  formatVersion: number;
  pointCount: number;
  sizeBytes: number;
  checksum: string;
};

export type ActivityRouteCacheEntry = {
  body?: Uint8Array;
  pending?: Promise<Uint8Array>;
  expiresAt: number;
};
