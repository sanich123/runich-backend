export const ACTIVITY_VISIBILITY = {
  public: 'public',
  followers: 'followers',
  private: 'private',
} as const;

export type ActivityVisibility = (typeof ACTIVITY_VISIBILITY)[keyof typeof ACTIVITY_VISIBILITY];

export const ACTIVITY_VISIBLE_TO_FOLLOWERS = [ACTIVITY_VISIBILITY.public, ACTIVITY_VISIBILITY.followers] as const;
