export function getVkRequestUrl(endpoint: string, parameters: Record<string, string>): URL {
  const url = new URL(endpoint);
  Object.entries(parameters).forEach(([name, value]) => url.searchParams.set(name, value));
  return url;
}

export function getSafeVkErrorCode(error: unknown): string {
  return typeof error === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(error) ? error : 'unknown';
}
