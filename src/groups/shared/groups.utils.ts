import { GROUP_CATEGORIES, GROUP_PRIVACY_VALUES, GROUP_SPORTS } from '../dto/groups.dto';
import type { GroupPhotoReviewStatus } from './groups.types';

export function isGroupSport(value: unknown): value is (typeof GROUP_SPORTS)[number] {
  return GROUP_SPORTS.some((sport) => sport === value);
}

export function isGroupCategory(value: unknown): value is (typeof GROUP_CATEGORIES)[number] {
  return GROUP_CATEGORIES.some((category) => category === value);
}

export function isGroupPrivacy(value: unknown): value is (typeof GROUP_PRIVACY_VALUES)[number] {
  return GROUP_PRIVACY_VALUES.some((privacy) => privacy === value);
}

type GroupPhotoReviewAsset = { status?: string | null; publishedKey?: string | null } | null | undefined;

export function getGroupPhotoReviewStatus(photo: GroupPhotoReviewAsset): GroupPhotoReviewStatus {
  if (photo?.status === 'queued') return 'queued';
  if (photo?.status === 'processing') return 'processing';
  if (photo?.status === 'review_required') return 'review_required';
  if (photo?.status === 'approved' && !photo.publishedKey) return 'approved';
  return null;
}
