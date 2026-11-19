import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import {
  createModerationEmailActionToken,
  getModerationEmailActionUrl,
  verifyModerationEmailActionToken,
} from '../moderation-email-action-token.utils';

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_API_PUBLIC_URL = process.env.API_PUBLIC_URL;

describe('moderation email action token', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-moderation-email-action-secret';
    process.env.API_PUBLIC_URL = 'https://api.example.test/path';
    jest.useFakeTimers().setSystemTime(new Date('2026-11-19T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_API_PUBLIC_URL === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = ORIGINAL_API_PUBLIC_URL;
  });

  it('creates and verifies a signed, expiring action token and absolute API link', () => {
    const token = createModerationEmailActionToken('report-1', 'hide_content');

    expect(verifyModerationEmailActionToken(token)).toEqual({
      reportId: 'report-1',
      action: 'hide_content',
      expiresAt: Math.floor(Date.parse('2026-11-26T12:00:00.000Z') / 1000),
    });
    expect(getModerationEmailActionUrl('report-1', 'hide_content')).toMatch(
      /^https:\/\/api\.example\.test\/moderation\/email-actions\//,
    );
  });

  it('rejects malformed, tampered, oversized, wrong-key, and expired tokens', () => {
    const token = createModerationEmailActionToken('report-1', 'remove_content');
    const lastCharacter = token.at(-1);
    const tamperedToken = `${token.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`;

    expect(verifyModerationEmailActionToken('invalid')).toBeNull();
    expect(verifyModerationEmailActionToken('a.')).toBeNull();
    expect(verifyModerationEmailActionToken('x'.repeat(2049))).toBeNull();
    expect(verifyModerationEmailActionToken(tamperedToken)).toBeNull();
    process.env.JWT_SECRET = 'different-secret';
    expect(verifyModerationEmailActionToken(token)).toBeNull();
    process.env.JWT_SECRET = 'test-moderation-email-action-secret';
    jest.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);
    expect(verifyModerationEmailActionToken(token)).toBeNull();
  });

  it('rejects correctly signed JSON that is not an action-token object', () => {
    const encodedPayload = Buffer.from('null').toString('base64url');
    const signingKey = createHmac('sha256', process.env.JWT_SECRET ?? '')
      .update('runich:moderation-email-action:v1')
      .digest();
    const signature = createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');

    expect(verifyModerationEmailActionToken(`${encodedPayload}.${signature}`)).toBeNull();
  });
});
