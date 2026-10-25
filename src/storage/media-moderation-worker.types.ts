export type MediaAsset = {
  id: string;
  ownerId: string;
  quarantineKey: string;
  contentType: string;
  attempts: number;
};

export type MediaModerationScanResult = {
  scores: Record<string, number>;
  frameCount: number | null;
  modelVersion?: string;
};
