import { Inject, Injectable, Optional } from '@nestjs/common';
import { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import type { PhotoUploadOptions, StorageFile, MediaUploadManifestEntry, UploadedPhotoBatch } from '../shared/types';
import type { ActivityHeartRateSampleObject, ActivityMediaObject, LocationObject } from 'src/activity/dto/activity.dto';
import { StorageCoreService } from './storage-core.service';
import { StorageUploadService } from './storage-upload.service';
import { StorageModerationService } from './storage-moderation.service';
import { StorageActivityService } from './storage-activity.service';
import { StorageProfileService } from './storage-profile.service';

@Injectable()
export class StorageService {
  private readonly core: StorageCoreService;
  private readonly uploads: StorageUploadService;
  private readonly moderation: StorageModerationService;
  private readonly activity: StorageActivityService;
  private readonly profile: StorageProfileService;

  get settings() {
    return this.core.settings;
  }

  get client() {
    return this.core.client;
  }

  constructor(
    @Optional() @Inject(LatencyMetricsService) latencyMetrics?: LatencyMetricsService,
    @Optional() @Inject(PrismaService) prisma?: PrismaService,
    @Optional() @Inject(StorageCoreService) core?: StorageCoreService,
    @Optional() @Inject(StorageModerationService) moderation?: StorageModerationService,
    @Optional() @Inject(StorageUploadService) uploads?: StorageUploadService,
    @Optional() @Inject(StorageActivityService) activity?: StorageActivityService,
    @Optional() @Inject(StorageProfileService) profile?: StorageProfileService,
  ) {
    this.core = core ?? new StorageCoreService(latencyMetrics);
    this.moderation = moderation ?? new StorageModerationService(this.core, prisma);
    this.uploads = uploads ?? new StorageUploadService(this.core, this.moderation, prisma);
    this.activity = activity ?? new StorageActivityService(this.core, prisma);
    this.profile = profile ?? new StorageProfileService(this.core);
  }

  async readJson<T>(key: string): Promise<T> {
    return this.core.readJson(key);
  }

  async readObject(key: string, missingObjectMessage = `S3 не вернул объект ${key}`) {
    return this.core.readObject(key, missingObjectMessage);
  }

  async downloadObjectToFile(key: string, filePath: string, missingObjectMessage = `S3 не вернул объект ${key}`) {
    return this.core.downloadObjectToFile(key, filePath, missingObjectMessage);
  }

  async uploadObject(key: string, body: Buffer | Uint8Array, contentType: string, cacheControl?: string) {
    return this.core.uploadObject(key, body, contentType, cacheControl);
  }

  async deleteObjectByKey(key: string) {
    return this.core.deleteObjectByKey(key);
  }

  async deleteUserFiles(userId: string) {
    return this.core.deleteUserFiles(userId);
  }

  getPublicUrl(key: string) {
    return this.core.getPublicUrl(key);
  }

  getOwnedKey(userId: string, publicUrl: string) {
    return this.core.getOwnedKey(userId, publicUrl);
  }

  async uploadPhoto(
    userId: string,
    file: StorageFile,
    options: PhotoUploadOptions = {},
    manifestEntry?: MediaUploadManifestEntry,
  ) {
    return this.uploads.uploadPhoto(userId, file, options, manifestEntry);
  }

  async uploadPhotos(
    userId: string,
    files: StorageFile[],
    options: PhotoUploadOptions = {},
    rawManifest = '',
  ): Promise<UploadedPhotoBatch[]> {
    return this.uploads.uploadPhotos(userId, files, options, rawManifest);
  }

  async deleteUnattachedModerationAsset(ownerId: string, assetId: string) {
    return this.moderation.deleteUnattachedModerationAsset(ownerId, assetId);
  }

  async deleteGroupPhotoAsset(ownerId: string, assetId: string | null) {
    return this.moderation.deleteGroupPhotoAsset(ownerId, assetId);
  }

  async deleteActivityModerationAssets(ownerId: string, assetIds: Array<string | null | undefined>) {
    return this.moderation.deleteActivityModerationAssets(ownerId, assetIds);
  }

  async getModerationUploadStatuses(ownerId: string, assetIds: string[]) {
    return this.moderation.getModerationUploadStatuses(ownerId, assetIds);
  }

  async getOwnerModerationPreviewUrl(ownerId: string, assetId: string | null | undefined) {
    return this.moderation.getOwnerModerationPreviewUrl(ownerId, assetId);
  }

  async getOwnerModerationPreviewUrls(ownerId: string, assetIds: Array<string | null | undefined>) {
    return this.moderation.getOwnerModerationPreviewUrls(ownerId, assetIds);
  }

  async downloadQuarantineObjectToFile(key: string, filePath: string) {
    return this.moderation.downloadQuarantineObjectToFile(key, filePath);
  }

  async getQuarantinePreviewUrl(key: string) {
    return this.moderation.getQuarantinePreviewUrl(key);
  }

  async approveModerationAsset(assetId: string, reviewerId?: string, reviewNote?: string) {
    return this.moderation.approveModerationAsset(assetId, reviewerId, reviewNote);
  }

  async publishApprovedModerationAsset(ownerId: string, assetId: string) {
    return this.moderation.publishApprovedModerationAsset(ownerId, assetId);
  }

  async refreshLinkedActivityMedia(assetIds: Array<string | null | undefined>) {
    return this.moderation.refreshLinkedActivityMedia(assetIds);
  }

  async rejectModerationAsset(assetId: string, reviewerId: string, reviewNote?: string) {
    return this.moderation.rejectModerationAsset(assetId, reviewerId, reviewNote);
  }

  async uploadMigrationArchive(userId: string, migrationId: string, filePath: string) {
    return this.activity.uploadMigrationArchive(userId, migrationId, filePath);
  }

  async uploadActivityRoute(userId: string, activityId: string, locations: LocationObject[]) {
    return this.activity.uploadActivityRoute(userId, activityId, locations);
  }

  async readActivityRoute(key: string) {
    return this.activity.readActivityRoute(key);
  }

  async uploadActivityHeartRateSamples(userId: string, activityId: string, samples: ActivityHeartRateSampleObject[]) {
    return this.activity.uploadActivityHeartRateSamples(userId, activityId, samples);
  }

  async readActivityHeartRateSamples(key: string) {
    return this.activity.readActivityHeartRateSamples(key);
  }

  async promoteActivityPhotos(
    userId: string,
    activityId: string,
    photos: ActivityMediaObject[],
    createdAt = new Date(),
  ) {
    return this.activity.promoteActivityPhotos(userId, activityId, photos, createdAt);
  }

  async promoteProfilePhoto(userId: string, publicUrl: string) {
    return this.profile.promoteProfilePhoto(userId, publicUrl);
  }

  async deletePhoto(userId: string, publicUrl: string) {
    return this.profile.deletePhoto(userId, publicUrl);
  }
}
