import { normalizeEmail } from './russian-email';

export const SUPERUSER_AUDIT_ACTOR = 'system:superuser-email-allowlist';

export function getSuperuserEmails(value: string | undefined = process.env.SUPERUSER_EMAILS) {
  const emails = (value ?? '').split(',').map(normalizeEmail).filter(Boolean);
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error('SUPERUSER_EMAILS must contain comma-separated email addresses');
  }
  return new Set(emails);
}
