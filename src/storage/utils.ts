export function getStorageErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
