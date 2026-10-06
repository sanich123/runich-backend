/* eslint-disable @typescript-eslint/no-explicit-any -- seed payloads are intentionally dynamic at this boundary. */

export type AnyRecord = Record<string, any>;

export type MockProfilePrivacySettings = {
  profileSearchVisible: boolean;
  allowNewFollowers: boolean;
  allowActivityInteractions: boolean;
  allowLikesListViewing: boolean;
  hideActivityStatistics: boolean;
  hideFollowingList: boolean;
  hideProfilePhotos: boolean;
};

export type MockUser = {
  id: string;
  email: string;
  profile?: { id: string; bio?: string | null; [key: string]: unknown } | null;
  [key: string]: any;
};

export type SeedUser = { id: string; profile: NonNullable<MockUser['profile']> };

export type MockActivitySeedStats = {
  activityTotal: number;
  commentTotal: number;
  activityLikeTotal: number;
  commentLikeTotal: number;
};
