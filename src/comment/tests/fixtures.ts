type CommentLikeFixture = {
  profileId: string;
  authorId: string;
  commentId: string;
};

export function makeCommentLike(overrides: Partial<CommentLikeFixture> = {}) {
  return {
    profileId: 'profile-1',
    authorId: 'user-1',
    commentId: 'comment-1',
    ...overrides,
  };
}
