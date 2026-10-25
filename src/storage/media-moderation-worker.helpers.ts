import {
  MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_REVIEW_THRESHOLDS,
} from './media-moderation-thresholds';

export function getMediaModerationReviewReason(scores: Record<string, number>) {
  const matches = Object.entries(MEDIA_MODERATION_REVIEW_THRESHOLDS)
    .filter(([className, threshold]) => (scores[className] ?? 0) >= threshold)
    .sort((first, second) => scores[second[0]]! - scores[first[0]]!);
  if (!matches.length) return null;
  return matches.map(([className]) => `${className}=${scores[className]!.toFixed(2)}`).join(', ');
}

export function mergeMediaModerationScores(target: Record<string, number>, source: Record<string, number>) {
  for (const [className, probability] of Object.entries(source)) {
    target[className] = Math.max(target[className] ?? 0, probability);
  }
}

export function getMediaModerationProviderName(modelVersion: string) {
  const usesGoogleVision = modelVersion.includes(MEDIA_MODERATION_GOOGLE_VISION_MODEL_VERSION);
  const usesNsfwJs = modelVersion.includes(MEDIA_MODERATION_MODEL_VERSION);
  if (usesGoogleVision && usesNsfwJs) return 'Google Cloud Vision SafeSearch и NSFWJS';
  if (usesGoogleVision) return 'Google Cloud Vision SafeSearch';
  return 'NSFWJS';
}
