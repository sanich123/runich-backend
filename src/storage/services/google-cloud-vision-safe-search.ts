import { getAppEnvironment } from 'src/common/config/environment';
import type { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { MEDIA_MODERATION_GOOGLE_VISION_MONTHLY_LIMIT } from './media-moderation-thresholds';

const LIKELIHOOD_SCORE: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0,
  UNLIKELY: 0.1,
  POSSIBLE: 0.4,
  LIKELY: 0.75,
  VERY_LIKELY: 0.95,
};

type VisionResponse = {
  error?: { message?: string };
  safeSearchAnnotation?: {
    adult?: string;
    spoof?: string;
    medical?: string;
    violence?: string;
    racy?: string;
  };
};

export class GoogleCloudVisionSafeSearch {
  constructor(private readonly prisma: PrismaService) {}

  async reserveUnit() {
    if (getAppEnvironment() !== 'production' || !this.getApiKey()) return false;

    const monthKey = new Date().toISOString().slice(0, 7);
    const rows = await this.prisma.$queryRaw<Array<{ used_units: number }>>`
      INSERT INTO "GoogleVisionMonthlyUsage" ("month_key", "used_units")
      VALUES (${monthKey}, 1)
      ON CONFLICT ("month_key") DO UPDATE
      SET "used_units" = "GoogleVisionMonthlyUsage"."used_units" + 1
      WHERE "GoogleVisionMonthlyUsage"."used_units" < ${MEDIA_MODERATION_GOOGLE_VISION_MONTHLY_LIMIT}
      RETURNING "used_units"
    `;
    return rows.length > 0;
  }

  async classifyImages(imageBuffers: Buffer[]) {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('Google Cloud Vision API key is not configured');

    const requests = imageBuffers.map((image) => ({
      image: { content: image.toString('base64') },
      features: [{ type: 'SAFE_SEARCH_DETECTION' }],
    }));
    const url = new URL('https://vision.googleapis.com/v1/images:annotate');
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Google Cloud Vision returned HTTP ${response.status}`);

    const payload = (await response.json()) as { responses?: VisionResponse[]; error?: { message?: string } };
    if (payload.error || !Array.isArray(payload.responses) || payload.responses.length !== imageBuffers.length) {
      throw new Error('Google Cloud Vision returned an incomplete SafeSearch response');
    }
    return payload.responses.map(({ error, safeSearchAnnotation }) => {
      if (error || !safeSearchAnnotation) throw new Error('Google Cloud Vision SafeSearch detection failed');
      return {
        Porn: LIKELIHOOD_SCORE[safeSearchAnnotation.adult ?? 'UNKNOWN'] ?? 0,
        Spoof: LIKELIHOOD_SCORE[safeSearchAnnotation.spoof ?? 'UNKNOWN'] ?? 0,
        Medical: LIKELIHOOD_SCORE[safeSearchAnnotation.medical ?? 'UNKNOWN'] ?? 0,
        Violence: LIKELIHOOD_SCORE[safeSearchAnnotation.violence ?? 'UNKNOWN'] ?? 0,
        Sexy: LIKELIHOOD_SCORE[safeSearchAnnotation.racy ?? 'UNKNOWN'] ?? 0,
      };
    });
  }

  private getApiKey() {
    return process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  }
}
