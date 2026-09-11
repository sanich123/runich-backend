const RUSSIAN_EMAIL_DOMAIN_SUFFIXES = ['.ru', '.рф', '.xn--p1ai'] as const;

export const RUSSIAN_EMAIL_REGISTRATION_ERROR =
  'Для регистрации используйте адрес российского почтового оператора (домен .ru или .рф)';

export function isRussianEmailAddress(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) return false;

  const domain = normalizedEmail.slice(atIndex + 1);
  return RUSSIAN_EMAIL_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}
