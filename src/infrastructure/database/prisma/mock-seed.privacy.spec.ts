import { mockProfilePrivacySettingsForIndex } from './mock-seed';

describe('mock profile privacy seed presets', () => {
  it('seeds a fully private profile', () => {
    expect(mockProfilePrivacySettingsForIndex(0)).toEqual({
      profileSearchVisible: false,
      allowNewFollowers: true,
      allowActivityInteractions: false,
      allowLikesListViewing: true,
      allowActivityReplayViewing: false,
      allowActivitySharing: false,
      hideActivityStatistics: true,
      hideFollowingList: true,
      hideProfilePhotos: true,
    });
  });

  it('seeds a fully open profile', () => {
    expect(mockProfilePrivacySettingsForIndex(4)).toEqual({
      profileSearchVisible: true,
      allowNewFollowers: true,
      allowActivityInteractions: true,
      allowLikesListViewing: true,
      allowActivityReplayViewing: true,
      allowActivitySharing: true,
      hideActivityStatistics: false,
      hideFollowingList: false,
      hideProfilePhotos: false,
    });
  });

  it('includes intermediate combinations and cycles through the presets', () => {
    expect(mockProfilePrivacySettingsForIndex(2)).toEqual({
      profileSearchVisible: true,
      allowNewFollowers: true,
      allowActivityInteractions: true,
      allowLikesListViewing: false,
      allowActivityReplayViewing: false,
      allowActivitySharing: true,
      hideActivityStatistics: true,
      hideFollowingList: false,
      hideProfilePhotos: true,
    });
    expect(mockProfilePrivacySettingsForIndex(1).allowNewFollowers).toBe(false);
    expect(mockProfilePrivacySettingsForIndex(6).allowNewFollowers).toBe(false);
    expect(mockProfilePrivacySettingsForIndex(5)).toEqual(mockProfilePrivacySettingsForIndex(0));
  });

  it.each([
    'profileSearchVisible',
    'allowNewFollowers',
    'allowActivityInteractions',
    'allowLikesListViewing',
    'allowActivityReplayViewing',
    'allowActivitySharing',
    'hideActivityStatistics',
    'hideFollowingList',
    'hideProfilePhotos',
  ] as const)('covers both values for %s', (field) => {
    expect(new Set([0, 1, 2, 3, 4].map((index) => mockProfilePrivacySettingsForIndex(index)[field]))).toEqual(
      new Set([false, true]),
    );
  });
});
