import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

export const RATE_LIMITS = {
  authAttempt: { limit: 5, ttl: 60_000 },
  emailCode: { limit: 5, ttl: 10 * 60_000 },
  passwordChange: { limit: 5, ttl: 10 * 60_000 },
  stravaImport: { limit: 2, ttl: 10 * 60_000 },
  feedbackUpload: { limit: 5, ttl: 10 * 60_000 },
} as const;

export function RateLimit(limit: number, ttl: number): MethodDecorator {
  return applyDecorators(Throttle({ default: { limit, ttl } }), UseGuards(ThrottlerGuard));
}
