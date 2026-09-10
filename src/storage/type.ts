import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

export type StorageFile = {
  buffer?: Buffer;
  path?: string;
  size?: number;
  originalname: string;
  mimetype: string;
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
