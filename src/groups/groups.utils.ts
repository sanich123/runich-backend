import { GROUP_CATEGORIES, GROUP_PRIVACY_VALUES, GROUP_SPORTS } from './groups.dto';

export function isGroupSport(value: unknown): value is (typeof GROUP_SPORTS)[number] {
  return GROUP_SPORTS.some((sport) => sport === value);
}

export function isGroupCategory(value: unknown): value is (typeof GROUP_CATEGORIES)[number] {
  return GROUP_CATEGORIES.some((category) => category === value);
}

export function isGroupPrivacy(value: unknown): value is (typeof GROUP_PRIVACY_VALUES)[number] {
  return GROUP_PRIVACY_VALUES.some((privacy) => privacy === value);
}
