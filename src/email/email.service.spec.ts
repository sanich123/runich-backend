import { jest } from '@jest/globals';

const sendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({ messageId: 'message-id' });
const createTransport = jest.fn(() => ({ sendMail }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport },
}));

const { EmailService } = await import('./email.service');

const originalEnvironment = { ...process.env };

const baseEmail = {
  name: 'Ann',
  surname: 'Runner',
  profilePhoto: 'https://example.com/profile.jpg',
  recepientName: 'Bob',
  recepientSurname: 'Runner',
  recepientEmail: 'bob@example.com',
};

function mockEmailDelivery(error?: Error) {
  if (error) {
    sendMail.mockRejectedValueOnce(error);
  } else {
    sendMail.mockResolvedValueOnce({ messageId: 'message-id' });
  }
}

describe('EmailService', () => {
  beforeEach(() => {
    process.env.YANDEX_SMTP_USER = 'Runich.app@ya.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'application-password';
    process.env.EMAIL_API_TIMEOUT = '5000';
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-id' });
    createTransport.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('sends all notification and authentication email types', async () => {
    const service = new EmailService();
    mockEmailDelivery();
    await expect(
      service.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'https://example.com/map.jpg' }),
    ).resolves.toBeUndefined();
    mockEmailDelivery();
    await expect(
      service.sendCommentEmailNotification({
        ...baseEmail,
        comment: 'Nice run',
        mapPhotoUrl: 'https://example.com/map.jpg',
      }),
    ).resolves.toBeUndefined();
    mockEmailDelivery();
    await expect(
      service.sendCommentLikeEmailNotification({ ...baseEmail, comment: 'Nice run' }),
    ).resolves.toBeUndefined();
    mockEmailDelivery();
    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'access-token')).resolves.toBeUndefined();
    mockEmailDelivery();
    await expect(service.sendPasswordChangeCode('bob@example.com', 123456)).resolves.toBeUndefined();
    mockEmailDelivery();
    await expect(service.sendLoginLink('bob@example.com', 'access-token')).resolves.toBeUndefined();
  });

  it('propagates Yandex SMTP failures from every email type', async () => {
    const service = new EmailService();
    const smtpError = new Error('Yandex SMTP rejected message');
    mockEmailDelivery(smtpError);
    await expect(service.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'map' })).rejects.toThrow(
      'Yandex SMTP rejected message',
    );
    mockEmailDelivery(smtpError);
    await expect(
      service.sendCommentEmailNotification({ ...baseEmail, comment: 'Comment', mapPhotoUrl: 'map' }),
    ).rejects.toThrow('Yandex SMTP rejected message');
    mockEmailDelivery(smtpError);
    await expect(service.sendCommentLikeEmailNotification({ ...baseEmail, comment: 'Comment' })).rejects.toThrow(
      'Yandex SMTP rejected message',
    );
    mockEmailDelivery(smtpError);
    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'token')).rejects.toThrow(
      'Yandex SMTP rejected message',
    );
    mockEmailDelivery(smtpError);
    await expect(service.sendPasswordChangeCode('bob@example.com', 123456)).rejects.toThrow(
      'Yandex SMTP rejected message',
    );
    mockEmailDelivery(smtpError);
    await expect(service.sendLoginLink('bob@example.com', 'access-token')).rejects.toThrow(
      'Yandex SMTP rejected message',
    );
  });

  it('reports missing email configuration as an error', async () => {
    delete process.env.YANDEX_SMTP_USER;
    const service = new EmailService();

    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'token')).rejects.toThrow(
      'Не настроена обязательная переменная окружения: YANDEX_SMTP_USER',
    );
  });
});
