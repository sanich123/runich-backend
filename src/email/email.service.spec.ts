import { jest } from '@jest/globals';
import { EmailService } from './email.service';

const originalEnvironment = { ...process.env };
const originalFetch = global.fetch;

const baseEmail = {
  name: 'Ann',
  surname: 'Runner',
  profilePhoto: 'https://example.com/profile.jpg',
  recepientName: 'Bob',
  recepientSurname: 'Runner',
  recepientEmail: 'bob@example.com',
};

function mockEmailApi(status = 200) {
  global.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'message-id' }), { status }));
}

describe('EmailService', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_SECRET = 'client-secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh-token';
    process.env.USER_EMAIL = 'runich.sender@gmail.com';
    process.env.EMAIL_API_TIMEOUT = '5000';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends all notification and authentication email types', async () => {
    const service = new EmailService();
    mockEmailApi();
    await expect(
      service.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'https://example.com/map.jpg' }),
    ).resolves.toBeUndefined();
    mockEmailApi();
    await expect(
      service.sendCommentEmailNotification({
        ...baseEmail,
        comment: 'Nice run',
        mapPhotoUrl: 'https://example.com/map.jpg',
      }),
    ).resolves.toBeUndefined();
    mockEmailApi();
    await expect(
      service.sendCommentLikeEmailNotification({ ...baseEmail, comment: 'Nice run' }),
    ).resolves.toBeUndefined();
    mockEmailApi();
    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'access-token')).resolves.toBeUndefined();
    mockEmailApi();
    await expect(service.sendPasswordChangeCode('bob@example.com', 123456)).resolves.toBeUndefined();
  });

  it('propagates Gmail failures from every email type', async () => {
    const service = new EmailService();
    mockEmailApi(500);
    await expect(service.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'map' })).rejects.toThrow(
      'Gmail API returned 500',
    );
    mockEmailApi(500);
    await expect(
      service.sendCommentEmailNotification({ ...baseEmail, comment: 'Comment', mapPhotoUrl: 'map' }),
    ).rejects.toThrow('Gmail API returned 500');
    mockEmailApi(500);
    await expect(service.sendCommentLikeEmailNotification({ ...baseEmail, comment: 'Comment' })).rejects.toThrow(
      'Gmail API returned 500',
    );
    mockEmailApi(500);
    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'token')).rejects.toThrow(
      'Gmail API returned 500',
    );
    mockEmailApi(500);
    await expect(service.sendPasswordChangeCode('bob@example.com', 123456)).rejects.toThrow('Gmail API returned 500');
  });

  it('reports missing email configuration as an error', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const service = new EmailService();

    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'token')).rejects.toThrow(
      'GOOGLE_CLIENT_ID must be configured',
    );
  });
});
