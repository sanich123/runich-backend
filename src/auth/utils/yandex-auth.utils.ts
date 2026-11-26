import { UnauthorizedException } from '@nestjs/common';

export type YandexUserProfile = {
  default_email?: string;
  login?: string;
  first_name?: string;
  last_name?: string;
  real_name?: string;
  city?: string;
  default_avatar_id?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseYandexUserProfile(payload: unknown): YandexUserProfile {
  if (!isRecord(payload)) {
    throw new UnauthorizedException('Яндекс вернул некорректный профиль пользователя');
  }

  const profile: YandexUserProfile = {};
  for (const key of [
    'default_email',
    'login',
    'first_name',
    'last_name',
    'real_name',
    'city',
    'default_avatar_id',
  ] as const) {
    const value = payload[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      throw new UnauthorizedException('Яндекс вернул некорректный профиль пользователя');
    }
    profile[key] = value;
  }

  return profile;
}
