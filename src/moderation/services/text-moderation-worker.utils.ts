export const TEXT_MODERATION_POLL_INTERVAL_MS = 5_000;
export const TEXT_MODERATION_STALE_PROCESSING_MS = 15 * 60_000;
export const DEFAULT_TEXT_MODERATION_LOCAL_REVIEW_THRESHOLD = 0.5;
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
  return null;
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
