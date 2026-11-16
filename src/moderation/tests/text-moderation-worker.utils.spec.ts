import {
  getLocalReviewReason,
  normalizeModerationText,
  parseClassificationLabels,
} from '../services/text-moderation-worker.utils';

describe('text moderation utilities', () => {
  it('normalizes Unicode, zero-width characters and whitespace', () => {
    expect(normalizeModerationText('  Ｒｕｎ' + String.fromCharCode(0x200b, 10) + '   club  ')).toBe('Run club');
  });

  it('detects repeated links and repeated phrases locally', () => {
    expect(getLocalReviewReason('https://a.test https://a.test')).toBe('link_spam');
    expect(getLocalReviewReason('Run run run run run run')).toBe('repeated_text');
    expect(getLocalReviewReason('An ordinary training note')).toBeNull();
  });

  it('parses local classifier labels and rejects malformed scores', () => {
    expect(parseClassificationLabels([[{ label: 'TOXIC', score: 0.8 }]])).toEqual([{ label: 'toxic', score: 0.8 }]);
    expect(parseClassificationLabels([{ label: 'not-toxic', score: 0.2 }])).toEqual([
      { label: 'not-toxic', score: 0.2 },
    ]);
    expect(parseClassificationLabels([{ label: 'toxic', score: Number.NaN }])).toEqual([]);
    expect(parseClassificationLabels([{ label: 'toxic', score: 0.2 }, { unexpected: true }])).toEqual([]);
    expect(parseClassificationLabels({ label: 'toxic', score: 0.9 })).toEqual([]);
  });
});
