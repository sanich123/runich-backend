import {
  MEDIA_MODERATION_GOOGLE_VISION_MODEL_PREFIX,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_REVIEW_THRESHOLDS,
} from './media-moderation-thresholds';

export function getMediaModerationReviewReason(scores: Record<string, number>) {
  const matches = getMediaModerationReviewMatches(scores);
  if (!matches.length) return null;
  return matches.map(([className]) => `${className}=${scores[className]!.toFixed(2)}`).join(', ');
}

export function getMediaModerationReportReason(scores: Record<string, number>) {
  const strongestClass = getMediaModerationReviewMatches(scores)[0]?.[0];
  if (strongestClass === 'Violence') return 'violence';
  if (strongestClass === 'Porn' || strongestClass === 'Hentai' || strongestClass === 'Sexy') {
    return 'sexual_content';
  }
  return 'other';
}

function getMediaModerationReviewMatches(scores: Record<string, number>) {
  return Object.entries(MEDIA_MODERATION_REVIEW_THRESHOLDS)
    .filter(([className, threshold]) => (scores[className] ?? 0) >= threshold)
    .sort((first, second) => scores[second[0]]! - scores[first[0]]!);
}

export function mergeMediaModerationScores(target: Record<string, number>, source: Record<string, number>) {
  for (const [className, probability] of Object.entries(source)) {
    target[className] = Math.max(target[className] ?? 0, probability);
  }
}

export function getMediaModerationProviderName(modelVersion: string) {
  const usesGoogleVision = modelVersion.includes(MEDIA_MODERATION_GOOGLE_VISION_MODEL_PREFIX);
  const usesNsfwJs = modelVersion.includes(MEDIA_MODERATION_MODEL_VERSION);
  if (usesGoogleVision && usesNsfwJs) return 'Google Cloud Vision SafeSearch и NSFWJS';
  if (usesGoogleVision) return 'Google Cloud Vision SafeSearch';
  return 'NSFWJS';
}
