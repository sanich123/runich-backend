import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

export type StorageFile = {
  buffer: Buffer;
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
