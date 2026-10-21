import {
  CREATE_MANY_BATCH_SIZE,
  MOCK_ACTIVITY_COUNT,
  MOCK_PROFILE_PRIVACY_PRESETS,
  MOCK_RUNNERS,
  MOCK_RUNNER_PHOTOS,
} from './mock-seed.constants';
import type { MockProfilePrivacySettings } from './mock-seed.types';

export function mockProfilePrivacySettingsForIndex(index: number): MockProfilePrivacySettings {
  return MOCK_PROFILE_PRIVACY_PRESETS[index % MOCK_PROFILE_PRIVACY_PRESETS.length];
}

export function random(seed: number, max: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.floor((value - Math.floor(value)) * (max + 1));
}

export function profileImageUrl(index: number) {
  return MOCK_RUNNER_PHOTOS[index % MOCK_RUNNER_PHOTOS.length];
}

export function mockRunner(index: number) {
  const [baseName, baseSurname, city] = MOCK_RUNNERS[index % MOCK_RUNNERS.length];
  const batch = Math.floor(index / MOCK_RUNNERS.length);
  const suffix = batch === 0 ? '' : ` ${batch + 1}`;

  return { name: `${baseName}${suffix}`, surname: `${baseSurname}${suffix}`, city };
}

export function mockActivityCount() {
  return MOCK_ACTIVITY_COUNT;
}

export async function createManyInBatches<T>(items: T[], createMany: (data: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < items.length; offset += CREATE_MANY_BATCH_SIZE) {
    await createMany(items.slice(offset, offset + CREATE_MANY_BATCH_SIZE));
  }
}
