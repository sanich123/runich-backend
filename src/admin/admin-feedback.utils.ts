export function formatFeedbackDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function parseFeedbackAttachments(value: unknown): Array<{ url: string; thumbnail: string | null }> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('url' in item) || typeof item.url !== 'string') return [];

    return [
      {
        url: item.url,
        thumbnail: 'thumbnail' in item && typeof item.thumbnail === 'string' ? item.thumbnail : null,
      },
    ];
  });
}
