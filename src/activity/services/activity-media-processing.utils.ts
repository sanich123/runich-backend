export function getMediaProcessingErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
