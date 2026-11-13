import {
  getLocalReviewReason,
  isRiskLabel,
  normalizeModerationText,
  parseHuggingFaceLabels,
} from '../services/text-moderation-worker.utils';

describe('text moderation utilities', () => {
  it('normalizes Unicode, zero-width characters and whitespace', () => {
    expect(normalizeModerationText('  Ｒｕｎ' + String.fromCharCode(0x200b, 10) + '   club  ')).toBe('Run club');
  });

  it('detects configured terms, repeated links and repeated phrases locally', () => {
    process.env.TEXT_MODERATION_LOCAL_TERMS = ' banned |';
    expect(getLocalReviewReason('Contains BANNED text')).toBe('configured_term');
    delete process.env.TEXT_MODERATION_LOCAL_TERMS;

    expect(getLocalReviewReason('https://a.test https://a.test')).toBe('link_spam');
    expect(getLocalReviewReason('Run run run run run run')).toBe('repeated_text');
    expect(getLocalReviewReason('An ordinary training note')).toBeNull();
  });

  it('parses both supported Hugging Face output shapes and rejects malformed scores', () => {
    expect(parseHuggingFaceLabels([[{ label: 'TOXIC', score: 0.8 }]])).toEqual([{ label: 'toxic', score: 0.8 }]);
    expect(parseHuggingFaceLabels([{ label: 'threat', score: 0.2 }])).toEqual([{ label: 'threat', score: 0.2 }]);
    expect(parseHuggingFaceLabels([{ label: 'toxic', score: Number.NaN }])).toEqual([]);
    expect(parseHuggingFaceLabels([{ label: 'toxic', score: 0.2 }, { unexpected: true }])).toEqual([]);
    expect(parseHuggingFaceLabels({ label: 'toxic', score: 0.9 })).toEqual([]);
  });

  it('classifies non-risk labels separately from moderation risk labels', () => {
    expect(isRiskLabel('not toxic')).toBe(false);
    expect(isRiskLabel('non-toxic')).toBe(false);
    expect(isRiskLabel('identity_hate')).toBe(true);
    expect(isRiskLabel('threat')).toBe(true);
    expect(isRiskLabel('neutral')).toBe(false);
  });
});
