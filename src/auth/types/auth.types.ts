export interface SessionMetadata {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  model?: string;
  manufacturer?: string;
  osName?: string;
  osVersion?: string;
  deviceType?: string;
  appVersion?: string;
  appBuild?: string;
  userAgent?: string;
  ipAddress?: string;
}

export type VkState = { codeVerifier: string };
