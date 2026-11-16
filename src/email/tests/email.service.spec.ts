import { jest } from '@jest/globals';
import { EMAIL_DELIVERY_NOTICE } from '../../common/email/constants';

const sendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({ messageId: 'message-id' });
const createTransport = jest.fn(() => ({ sendMail }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport },
}));

const { EmailService } = await import('../email.service');
const originalEnvironment = { ...process.env };

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
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-id' });
    createTransport.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('places the login link before the confirmation code', async () => {
    const service = new EmailService();
    mockEmailDelivery();
    await service.sendConfirmationCode('bob@example.com', 1234, 'credential');
    const confirmationHtml = (sendMail.mock.calls.at(-1) as unknown as [{ html: string }])[0].html;
    expect(confirmationHtml.indexOf('login-from-url?code=credential')).toBeLessThan(confirmationHtml.indexOf('1234'));
  });

  it('adds delivery guidance to authentication emails', async () => {
    const service = new EmailService();
    const senders = [
      () => service.sendConfirmationCode('bob@example.com', 1234, 'credential'),
      () => service.sendPasswordChangeCode('bob@example.com', 123456),
      () => service.sendLoginLink('bob@example.com', 'credential'),
    ];

    for (const send of senders) {
      mockEmailDelivery();
      await send();
      const html = (sendMail.mock.calls.at(-1) as unknown as [{ html: string }])[0].html;
      expect(html).toContain(EMAIL_DELIVERY_NOTICE);
    }
  });

  it('propagates SMTP failures from authentication email types', async () => {
    const service = new EmailService();
    const smtpError = new Error('Yandex SMTP rejected message');
    mockEmailDelivery(smtpError);
    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'token')).rejects.toThrow(smtpError);
    mockEmailDelivery(smtpError);
    await expect(service.sendPasswordChangeCode('bob@example.com', 123456)).rejects.toThrow(smtpError);
    mockEmailDelivery(smtpError);
    await expect(service.sendLoginLink('bob@example.com', 'access-token')).rejects.toThrow(smtpError);
  });

  it('reports missing email configuration as an error', async () => {
    delete process.env.YANDEX_SMTP_USER;
    const service = new EmailService();

    await expect(service.sendConfirmationCode('bob@example.com', 1234, 'token')).rejects.toThrow(
      'Не настроена обязательная переменная окружения: YANDEX_SMTP_USER',
    );
  });

  it('sends branded support notification, receipt, and reply emails', async () => {
    const service = new EmailService();
    await service.sendNewFeedbackNotification({
      id: 'feedback-1',
      createdAt: new Date('2026-09-17T12:00:00.000Z'),
      kind: 'bug',
      topic: null,
      email: 'ann@example.com',
      text: 'Broken',
      deviceInfo: 'Android',
      attachments: [],
    });
    const createdAt = new Date('2026-09-17T12:00:00.000Z');
    await service.sendFeedbackReceipt('ann@example.com', createdAt);
    await service.sendFeedbackReply('ann@example.com', 'We fixed it', createdAt);

    expect(sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'runich.app@yandex.ru',
        subject: '[Runich] Новое обращение: bug',
        html: expect.stringContaining('feedbackId=feedback-1'),
      }),
    );
    expect(sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: 'ann@example.com', subject: '[Runich] Обращение принято' }),
    );
    expect(sendMail).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        to: 'ann@example.com',
        subject: expect.stringContaining('[Runich] Ответ по обращению от '),
        html: expect.stringContaining('Ответ на обращение от'),
      }),
    );
  });
});
