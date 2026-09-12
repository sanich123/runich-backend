export const LOAD_TEST_SEED_STATUS = {
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;

export type LoadTestSeedStatus = (typeof LOAD_TEST_SEED_STATUS)[keyof typeof LOAD_TEST_SEED_STATUS];

export const LOAD_TEST_DEFAULT_CONFIG = {
  followerCount: 100,
  activitiesPerFollower: 100,
  activityLikesPerActivity: 10,
  commentsPerActivity: 10,
  commentLikesPerComment: 1,
  photosPerActivity: 3,
} as const;

export type LoadTestSeedConfig = {
  followerCount: number;
  activitiesPerFollower: number;
  activityLikesPerActivity: number;
  commentsPerActivity: number;
  commentLikesPerComment: number;
  photosPerActivity: number;
};

export type LoadTestPhotoAsset = {
  url: string;
  thumbnail: string | null;
};

export type LoadTestActivityAsset = {
  sourceActivityId: string;
  title: string | null;
  sport: string;
  description: string | null;
  distance: number;
  duration: number;
  speed: number;
  elevationGain?: number | null;
  steps?: number | null;
  kilometresSplit?: unknown;
  date: string;
  route?: {
    key: string;
    formatVersion: number;
    pointCount: number;
    sizeBytes: number;
    checksum: string;
  };
};

export type LoadTestAssetManifest = {
  version: 1;
  generatedAt: string;
  photos: LoadTestPhotoAsset[];
  activities: LoadTestActivityAsset[];
};

export type LoadTestSeedJob = {
  id: string;
  runId: string;
  targetUserId: string;
  manifestKey: string;
  config: LoadTestSeedConfig;
  status: string;
  totalUsers: number;
  totalActivities: number;
  processedActivities: number;
  createdActivities: number;
  createdLikes: number;
  createdComments: number;
  createdCommentLikes: number;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type LoadTestSeedRequest = Partial<LoadTestSeedConfig> & {
  runId?: string;
  manifestKey?: string;
};
