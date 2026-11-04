import { Inject, Injectable } from '@nestjs/common';
import { StorageCoreService } from './storage-core.service';
import { BadRequestException } from '@nestjs/common';
import { getExtensionFromStorageKey, getProfilePhotoKey } from '../shared/storage-key';

@Injectable()
export class StorageProfileService {
  constructor(@Inject(StorageCoreService) private readonly core: StorageCoreService) {}

  async promoteProfilePhoto(userId: string, publicUrl: string) {
    if (this.core.isQuarantinePreviewUrl(publicUrl)) {
      throw new BadRequestException('Ссылку на фото из карантина нельзя сохранить в профиле');
    }
    const sourceKey = this.core.getPromotablePhotoKey(userId, publicUrl);
    if (!sourceKey) return publicUrl;

    const destinationKey = getProfilePhotoKey(userId, getExtensionFromStorageKey(sourceKey));
    await this.core.copyObject(sourceKey, destinationKey);
    await this.core.deleteObjectByKey(sourceKey);
    return this.core.getPublicUrl(destinationKey);
  }

  async deletePhoto(userId: string, publicUrl: string) {
    await this.core.deleteObjectByKey(this.core.getOwnedKey(userId, publicUrl));
  }
}
