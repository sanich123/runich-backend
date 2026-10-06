import { mockProfilePrivacySettingsForIndex } from './mock-seed';

describe('mock profile privacy seed presets', () => {
  it('seeds a fully private profile', () => {
    expect(mockProfilePrivacySettingsForIndex(0)).toEqual({
      profileSearchVisible: false,
      allowNewFollowers: true,
      allowActivityInteractions: false,
      allowLikesListViewing: true,
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
      allowLikesListViewing: true,
      hideActivityStatistics: true,
      hideFollowingList: false,
      hideProfilePhotos: true,
    });
    expect(mockProfilePrivacySettingsForIndex(1).allowNewFollowers).toBe(false);
    expect(mockProfilePrivacySettingsForIndex(6).allowNewFollowers).toBe(false);
    expect(mockProfilePrivacySettingsForIndex(5)).toEqual(mockProfilePrivacySettingsForIndex(0));
  });
});
