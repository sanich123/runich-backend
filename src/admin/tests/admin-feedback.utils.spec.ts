import { formatFeedbackDate, parseFeedbackAttachments } from '../admin-feedback.utils';

describe('admin feedback utilities', () => {
  it('formats Date instances while preserving serialized date strings', () => {
    expect(formatFeedbackDate(new Date('2026-09-17T12:00:00.000Z'))).toBe('2026-09-17T12:00:00.000Z');
    expect(formatFeedbackDate('2026-09-17T12:00:00.000Z')).toBe('2026-09-17T12:00:00.000Z');
  });

  it('returns an empty list for non-array attachment values', () => {
    expect(parseFeedbackAttachments(null)).toEqual([]);
    expect(parseFeedbackAttachments({ url: 'https://cdn.example/a.jpg' })).toEqual([]);
  });

  it('drops malformed attachment entries and normalizes thumbnail values', () => {
    expect(
      parseFeedbackAttachments([
        null,
        'https://cdn.example/string.jpg',
        {},
        { url: 42 },
        { url: 'https://cdn.example/one.jpg', thumbnail: 'https://cdn.example/thumb.jpg' },
        { url: 'https://cdn.example/two.jpg', thumbnail: 7 },
      ]),
    ).toEqual([
      { url: 'https://cdn.example/one.jpg', thumbnail: 'https://cdn.example/thumb.jpg' },
      { url: 'https://cdn.example/two.jpg', thumbnail: null },
    ]);
  });
});
