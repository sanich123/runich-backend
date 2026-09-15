export const SESSION_METADATA_LIMITS = {
  deviceId: 128,
  deviceName: 255,
  platform: 64,
  model: 128,
  manufacturer: 128,
  osName: 64,
  osVersion: 64,
  deviceType: 64,
  appVersion: 32,
  appBuild: 32,
  userAgent: 512,
  ipAddress: 128,
} as const;

export const CONFIRMATION_CODE_TTL_MS = 5 * 60_000;

export const VK_AUTHORIZE_URL = 'https://id.vk.com/authorize';
export const VK_TOKEN_URL = 'https://id.vk.com/oauth2/auth';
export const VK_USER_INFO_URL = 'https://id.vk.com/oauth2/user_info';
