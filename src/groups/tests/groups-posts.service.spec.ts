import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { asyncMock } from 'src/tests/helpers';
import { encodeGroupDateCursor } from '../shared/groups.pagination';
import { createGroupsServices, createModerationAccessMock, createPrismaMock } from './fixtures';

function createGroupsService(
  prisma: ReturnType<typeof createPrismaMock>,
  moderationAccess: ReturnType<typeof createModerationAccessMock>,
  storage?: object,
) {
  return createGroupsServices(prisma, moderationAccess, storage).posts;
}

describe('GroupsPostsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let moderationAccess: ReturnType<typeof createModerationAccessMock>;
  let service: ReturnType<typeof createGroupsServices>['posts'];

  beforeEach(() => {
    prisma = createPrismaMock();
    moderationAccess = createModerationAccessMock();
    service = createGroupsService(prisma, moderationAccess);
  });

  it('filters group posts to admin posts when requested by an active member', async () => {
    prisma.group.findUnique.mockResolvedValue({
      privacy: 'open',
      createdByUserId: 'owner-1',
      members: [{ status: 'active', feedPreference: 'admins' }],
    });
    prisma.groupMember.findMany.mockResolvedValue([{ userId: 'admin-1' }]);
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        createdByUserId: 'admin-1',
        text: 'Sunday run',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: null,
        author: {
          id: 'admin-1',
          profile: { name: 'Alex', surname: 'Runner', profilePhoto: 'photo-url', hideProfilePhotos: false },
        },
        photoAsset: null,
      },
    ]);

    const result = await service.getPosts('member-1', 'group-1');

    expect(prisma.groupPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', createdByUserId: { in: ['admin-1'] } }, take: 50 }),
    );
    expect(result).toEqual([
      {
        id: 'post-1',
        text: 'Sunday run',
        createdAt: '2026-10-29T10:00:00.000Z',
        author: { userId: 'admin-1', name: 'Alex Runner', profilePhoto: 'photo-url' },
        photoUrl: null,
      },
    ]);
  });

  it('returns no posts when an admin-only feed has no visible admins', async () => {
    prisma.group.findUnique.mockResolvedValue({
      privacy: 'open',
      createdByUserId: 'owner-1',
      members: [{ status: 'active', feedPreference: 'admins' }],
    });
    prisma.groupMember.findMany.mockResolvedValue([]);

    await expect(service.getPosts('member-1', 'group-1')).resolves.toEqual([]);
    expect(prisma.groupPost.findMany).not.toHaveBeenCalled();
  });

  it('returns approved group post photos and hides missing author profiles', async () => {
    const getPublicUrl = jest.fn().mockReturnValue('https://cdn.test/group-post.webp');
    const getOwnerModerationPreviewUrls = asyncMock().mockResolvedValue({});
    service = createGroupsService(prisma, moderationAccess, { getPublicUrl, getOwnerModerationPreviewUrls });
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-2',
        createdByUserId: 'author-1',
        text: 'Club update',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'approved-post-photo',
        author: { id: 'author-1', profile: null },
        photoAsset: { status: 'approved', publishedKey: 'groups/group-1/post.webp' },
      },
    ]);

    const result = await service.getPosts('viewer-1', 'group-1');

    expect(result).toEqual([expect.objectContaining({ author: null, photoUrl: 'https://cdn.test/group-post.webp' })]);
    expect(getPublicUrl).toHaveBeenCalledWith('groups/group-1/post.webp');
    expect(getOwnerModerationPreviewUrls).not.toHaveBeenCalled();
  });

  it('returns pending-photo status to readers and private preview URLs only to the post author', async () => {
    const getOwnerModerationPreviewUrls = asyncMock().mockResolvedValue({
      'pending-photo': 'https://cdn.test/private-preview.webp',
    });
    const getPublicUrl = jest.fn().mockReturnValue('https://cdn.test/approved.webp');
    service = createGroupsService(prisma, moderationAccess, { getOwnerModerationPreviewUrls, getPublicUrl });
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'group-owner', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'pending-post',
        createdByUserId: 'post-author',
        text: 'Pending photo',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'pending-photo',
        author: null,
        photoAsset: { status: 'review_required', publishedKey: null },
      },
      {
        id: 'rejected-post',
        createdByUserId: 'post-author',
        text: 'Rejected photo',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'rejected-photo',
        author: null,
        photoAsset: { status: 'rejected', publishedKey: null },
      },
      {
        id: 'text-post',
        createdByUserId: 'post-author',
        text: 'Text only',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: null,
        author: null,
        photoAsset: null,
      },
    ]);

    const authorView = await service.getPosts('post-author', 'group-1');
    expect(authorView).toEqual([
      expect.objectContaining({
        hasPhoto: true,
        photoPending: true,
        photoPreviewUrl: 'https://cdn.test/private-preview.webp',
      }),
      expect.objectContaining({ hasPhoto: true, photoPending: false, photoPreviewUrl: null }),
      expect.not.objectContaining({ hasPhoto: true }),
    ]);
    expect(getOwnerModerationPreviewUrls).toHaveBeenCalledWith('post-author', ['pending-photo']);

    const readerView = await service.getPosts('reader-1', 'group-1');
    expect(readerView[0]).toMatchObject({ hasPhoto: true, photoPending: true, photoPreviewUrl: null, photoUrl: null });
    expect(getOwnerModerationPreviewUrls).toHaveBeenCalledTimes(1);
  });

  it('omits an unavailable private post-photo preview', async () => {
    const getOwnerModerationPreviewUrls = asyncMock().mockRejectedValue(new Error('Preview unavailable'));
    service = createGroupsService(prisma, moderationAccess, { getOwnerModerationPreviewUrls });
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupPost.findMany.mockResolvedValue([
      {
        id: 'post-3',
        createdByUserId: 'owner-1',
        text: 'Waiting for moderation',
        createdAt: '2026-10-29T10:00:00.000Z',
        photoAssetId: 'pending-photo',
        author: null,
        photoAsset: { status: 'processing', publishedKey: null },
      },
    ]);

    await expect(service.getPosts('owner-1', 'group-1')).resolves.toEqual([
      expect.objectContaining({ hasPhoto: true, photoPending: true, photoPreviewUrl: null }),
    ]);
  });

  it('requires active membership to publish group posts', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'pending' });

    await expect(service.createPost('member-1', 'group-1', { text: 'Hello group' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.groupPost.create).not.toHaveBeenCalled();
  });

  it('publishes trimmed group post text for active members', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-1', text: 'Hello group' });

    await service.createPost('member-1', 'group-1', { text: ' Hello group ' });

    expect(prisma.groupPost.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', createdByUserId: 'member-1', text: 'Hello group', photoAssetId: null },
    });
  });

  it('returns a keyset-paginated post page and a terminal page without a cursor', async () => {
    const cursor = { date: new Date('2026-10-28T10:00:00.000Z'), id: 'post-0' };
    const firstPostDate = new Date('2026-10-29T10:00:00.000Z');
    prisma.group.findUnique.mockResolvedValue({ privacy: 'open', createdByUserId: 'owner-1', members: [] });
    prisma.groupPost.findMany.mockResolvedValueOnce([
      {
        id: 'post-1',
        createdByUserId: 'author-1',
        text: 'First post',
        createdAt: firstPostDate,
        photoAssetId: null,
        author: null,
        photoAsset: null,
      },
      {
        id: 'post-2',
        createdByUserId: 'author-2',
        text: 'Second post',
        createdAt: new Date('2026-10-29T11:00:00.000Z'),
        photoAssetId: null,
        author: null,
        photoAsset: null,
      },
    ]);

    const page = await service.getPosts('reader-1', 'group-1', 1, cursor, true);

    expect(prisma.groupPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'group-1',
          AND: [{ OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, id: { lt: cursor.id } }] }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
    expect(page).toMatchObject({
      items: [{ id: 'post-1', text: 'First post' }],
      hasMore: true,
      nextCursor: encodeGroupDateCursor({ date: firstPostDate, id: 'post-1' }),
    });

    prisma.groupPost.findMany.mockResolvedValueOnce([]);
    await expect(service.getPosts('reader-1', 'group-1', 1, undefined, true)).resolves.toMatchObject({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('accepts a pending image and rejects non-image or blank group posts', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ status: 'active' });
    prisma.mediaModerationAsset.findFirst
      .mockResolvedValueOnce({ status: 'queued', contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ status: 'approved', contentType: 'application/pdf' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-photo-1' });

    await expect(
      service.createPost('member-1', 'group-1', { text: 'Post', photoAssetId: 'rejected-photo' }),
    ).resolves.toEqual({ id: 'post-photo-1' });
    await expect(
      service.createPost('member-1', 'group-1', { text: 'Post', photoAssetId: 'not-an-image' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createPost('member-1', 'group-1', { text: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('notifies post readers according to announcement and per-group preferences', async () => {
    prisma.group.findUnique.mockResolvedValue({ name: 'Morning runners', createdByUserId: 'owner-1' });
    prisma.groupMember.findUnique.mockResolvedValue({ role: 'member', status: 'active' });
    prisma.groupPost.create.mockResolvedValue({ id: 'post-notify-1' });
    prisma.transaction.groupMember.findMany.mockResolvedValue([
      { userId: 'all-reader', notificationPreference: 'all' },
      { userId: 'announcement-reader', notificationPreference: 'announcements' },
      { userId: 'muted-reader', notificationPreference: 'off' },
    ]);
    prisma.transaction.profile.findUnique
      .mockResolvedValueOnce({ name: 'Alex', surname: 'Runner', profilePhoto: 'private.webp', hideProfilePhotos: true })
      .mockResolvedValue({
        emailNotifications: false,
        inAppNotifications: true,
        pushNotifications: false,
        groupPostsNotifications: true,
        groupEventsNotifications: true,
        language: 'russian',
      });
    prisma.transaction.notification.create.mockResolvedValue({ id: 'notification-1' });

    await service.createPost('member-1', 'group-1', { text: '  Sunday run  ' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.groupPost.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', createdByUserId: 'member-1', text: 'Sunday run', photoAssetId: null },
    });
    expect(prisma.transaction.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'all-reader',
        type: 'group-post',
        targetType: 'group-post',
        actorProfilePhoto: null,
        content: 'Новая запись в группе «Morning runners»: Sunday run',
      }),
      select: { id: true },
    });
  });

  it('returns not found for missing group posts', async () => {
    prisma.group.findUnique.mockResolvedValue(null);
    await expect(service.getPosts('visitor-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
