export const TEXT_MODERATION_POLL_INTERVAL_MS = 5_000;
export const TEXT_MODERATION_INFERENCE_METRICS_INTERVAL_MS = 60_000;
export const TEXT_MODERATION_STALE_PROCESSING_MS = 15 * 60_000;
export const DEFAULT_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD = 0.95;
export const MIN_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD = 0.95;
export const LOW_CONTEXT_TEXT_MODERATION_REVIEW_THRESHOLD = 0.99;
export const LOCAL_TEXT_MODERATION_MODEL_VERSION =
  'onnx-community/distilbert-multilingual-toxicity-classifier-ONNX@4fbacce:model_quantized.onnx';
export const ACTIVE_REPORT_STATUSES = ['open', 'in_review', 'appealed'] as const;

export function getTextModerationThreshold(name: string, fallback: number) {
  const configured = process.env[name]?.trim();
  const threshold = Number(configured ?? fallback);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`${name} должен быть числом от 0 до 1`);
  }
  return threshold;
}

export type TextTargetType = 'comment' | 'group_post' | 'activity_text';
export type TextModerationItem = { id: string; text: string; ownerId: string; targetType: TextTargetType };
export type ClassificationResult = {
  needsReview: boolean;
  scores: Record<string, number>;
  modelVersion: string;
  reason: string;
};
type ClassificationLabel = { label: string; score: number };

export function normalizeModerationText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLocalReviewReason(text: string) {
  const normalized = text.toLocaleLowerCase();
  const links = normalized.match(/https?:\/\/\S+/g) ?? [];
  if (links.length >= 4 || (links.length >= 2 && new Set(links).size < links.length)) return 'link_spam';
  if (/\b([\p{L}\p{N}]{2,})\b(?:\s+\1\b){5,}/iu.test(normalized)) return 'repeated_text';
  if (hasExplicitAbuseSignal(normalized)) return 'explicit_abuse';
  return null;
}

const EXPLICIT_ABUSE_WORDS = new Set([
  'нахуй',
  'сука',
  'суки',
  'суке',
  'суку',
  'сукой',
  'сукою',
  'сучка',
  'сучки',
  'сучке',
  'сучку',
  'сучкой',
  'чмо',
  'тварь',
  'твари',
  'говно',
  'говнюк',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'motherfucker',
]);

const EXPLICIT_ABUSE_PREFIXES = [
  'хуесос',
  'хуйн',
  'хуй',
  'хуя',
  'хуе',
  'хуё',
  'хуи',
  'хую',
  'пизд',
  'еб',
  'бля',
  'суч',
  'мудак',
  'гандон',
  'залуп',
  'дроч',
  'пидор',
  'пидар',
  'идиот',
  'дебил',
  'урод',
  'ничтож',
  'мраз',
  'сволоч',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'motherfucker',
];

const IDENTITY_GROUP_PREFIXES = [
  'мигрант',
  'евре',
  'цыган',
  'мусульман',
  'христиан',
  'украин',
  'русск',
  'армян',
  'араб',
  'гей',
  'лесбиян',
  'трансгендер',
  'инвалид',
  'женщин',
  'чернокож',
];

const HARMFUL_ACTION_PREFIXES = [
  'убить',
  'убива',
  'убей',
  'уничтож',
  'истреб',
  'выреза',
  'выгна',
  'выгон',
  'изгна',
  'изгон',
  'депортир',
  'лишить',
  'лишать',
];

const COLLECTIVE_TARGET_WORDS = new Set(['все', 'всех', 'всем', 'all', 'every', 'each']);
const HARMFUL_DIRECTIVE_WORDS = new Set([
  'надо',
  'нужно',
  'должны',
  'должен',
  'должна',
  'следует',
  'пусть',
  'should',
  'must',
]);

const DIRECTED_INSULT_PATTERN =
  /(?<![\p{L}\p{N}])(?:ты|вы|он|она)\s+(?:туп(?:ой|ая|ое|ые|ица|ицы)|мерзк[\p{L}]*|ничтож[\p{L}]*)(?![\p{L}\p{N}])/iu;

const DIRECT_THREATS = new Set([
  'сдохни',
  'сдохните',
  'умри',
  'умрите',
  'убью',
  'пристрелю',
  'зарежу',
  'убей',
  'убейте',
]);
const DIRECT_HOSTILITY_WORDS = new Set(['ненавижу', 'ненавидим', 'hate']);
const DIRECT_HOSTILITY_TARGETS = new Set(['тебя', 'вас', 'you', 'их', 'всех']);
const NEGATION_WORDS = new Set(['не', 'нельзя', 'запрещено', 'not', 'never', 'don']);

function startsWithAny(value: string, prefixes: string[]) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function hasDirectHostility(words: string[]) {
  return words.some((word, index) => {
    if (!DIRECT_HOSTILITY_WORDS.has(word)) return false;
    const target = words[index + 1] ?? '';
    if (startsWithAny(target, IDENTITY_GROUP_PREFIXES)) return true;
    if (!DIRECT_HOSTILITY_TARGETS.has(target)) return false;
    return target !== 'всех' || startsWithAny(words[index + 2] ?? '', IDENTITY_GROUP_PREFIXES);
  });
}

function hasCollectiveTargetedHarm(words: string[]) {
  return words.some((word, actionIndex) => {
    if (!startsWithAny(word, HARMFUL_ACTION_PREFIXES)) return false;
    if (words.slice(Math.max(0, actionIndex - 3), actionIndex).some((priorWord) => NEGATION_WORDS.has(priorWord))) {
      return false;
    }

    return words.some((groupWord, groupIndex) => {
      if (Math.abs(groupIndex - actionIndex) > 5 || !startsWithAny(groupWord, IDENTITY_GROUP_PREFIXES)) return false;
      const hasCollectiveTarget = words
        .slice(Math.max(0, groupIndex - 2), Math.min(words.length, groupIndex + 3))
        .some((nearbyWord) => COLLECTIVE_TARGET_WORDS.has(nearbyWord));
      if (!hasCollectiveTarget) return false;
      if (actionIndex < groupIndex) return true;
      return words.slice(groupIndex + 1, actionIndex).some((betweenWord) => HARMFUL_DIRECTIVE_WORDS.has(betweenWord));
    });
  });
}

function hasExplicitAbuseSignal(text: string) {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const hasAbuseWord = words.some(
    (word) => EXPLICIT_ABUSE_WORDS.has(word) || startsWithAny(word, EXPLICIT_ABUSE_PREFIXES),
  );
  const hasNegatedHostility = words.some(
    (word, index) =>
      NEGATION_WORDS.has(word) &&
      words.slice(index + 1, index + 4).some((nextWord) => DIRECT_HOSTILITY_WORDS.has(nextWord)),
  );

  return (
    hasAbuseWord ||
    DIRECTED_INSULT_PATTERN.test(text) ||
    words.some((word) => DIRECT_THREATS.has(word)) ||
    (hasDirectHostility(words) && !hasNegatedHostility) ||
    hasCollectiveTargetedHarm(words)
  );
}

export function getTextModerationReviewThreshold(text: string, configuredThreshold: number) {
  const calibratedThreshold = Math.max(configuredThreshold, MIN_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD);
  const wordCount = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return wordCount <= 4
    ? Math.max(calibratedThreshold, LOW_CONTEXT_TEXT_MODERATION_REVIEW_THRESHOLD)
    : calibratedThreshold;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseClassificationLabels(payload: unknown): ClassificationLabel[] {
  const raw = Array.isArray(payload) && Array.isArray(payload[0]) ? payload.flat() : payload;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const labels: ClassificationLabel[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return [];
    const candidate = item;
    if (
      typeof candidate.label !== 'string' ||
      typeof candidate.score !== 'number' ||
      !Number.isFinite(candidate.score) ||
      candidate.score < 0 ||
      candidate.score > 1
    )
      return [];
    labels.push({ label: candidate.label.toLocaleLowerCase(), score: candidate.score });
  }
  return labels;
}
