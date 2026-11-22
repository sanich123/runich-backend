import {
  getLocalReviewReason,
  getTextModerationReviewThreshold,
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

  it('routes explicit profanity, direct threats and targeted hate to review', () => {
    expect(getLocalReviewReason('Сука')).toBe('explicit_abuse');
    expect(getLocalReviewReason('Ты идиот')).toBe('explicit_abuse');
    expect(getLocalReviewReason('Сдохни')).toBe('explicit_abuse');
    expect(getLocalReviewReason('Ненавижу тебя')).toBe('explicit_abuse');
    expect(getLocalReviewReason('Всех мигрантов надо выгнать')).toBe('explicit_abuse');
  });

  it('does not treat transliteration, keyboard noise or negated hate as explicit abuse', () => {
    expect(getLocalReviewReason('айос')).toBeNull();
    expect(getLocalReviewReason('фвыа')).toBeNull();
    expect(getLocalReviewReason('Айос удобный')).toBeNull();
    expect(getLocalReviewReason('Не надо выгонять мигрантов')).toBeNull();
    expect(getLocalReviewReason('Не надо выгонять всех мигрантов')).toBeNull();
    expect(getLocalReviewReason('Исторически мигрантов депортировали')).toBeNull();
    expect(getLocalReviewReason('Не ненавижу тебя')).toBeNull();
    expect(getLocalReviewReason('Ненавижу дождь')).toBeNull();
    expect(getLocalReviewReason('Все мигранты были депортированы')).toBeNull();
    expect(getLocalReviewReason('Все женщины часто лишний раз проверяют расписание')).toBeNull();
  });

  it('raises the model threshold for low-context text and keeps a high floor for longer text', () => {
    expect(getTextModerationReviewThreshold('фвыа', 0.5)).toBe(0.99);
    expect(getTextModerationReviewThreshold('Айос удобный', 0.5)).toBe(0.99);
    expect(getTextModerationReviewThreshold('This was a good and useful training session.', 0.5)).toBe(0.95);
    expect(getTextModerationReviewThreshold('A longer comment with context.', 0.98)).toBe(0.98);
    expect(getTextModerationReviewThreshold('айос', 1)).toBe(1);
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
