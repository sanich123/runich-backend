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
  type FeedbackUser = {
    email: string;
    profile: { name: string | null; surname: string | null } | null;
  };
  const findUnique = jest.fn<() => Promise<FeedbackUser | null>>();
  const prisma = { user: { findUnique } };

  beforeEach(() => {
    process.env.YANDEX_SMTP_USER = 'Runich.app@ya.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'application-password';
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-id' });
    createTransport.mockClear();
    findUnique.mockReset().mockResolvedValue({
      email: 'ann@example.com',
      profile: { name: 'Ann', surname: 'Runner' },
    });
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

  it('adds spam delivery guidance to authentication emails', async () => {
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

  it('propagates Yandex SMTP failures from authentication email types', async () => {
    const service = new EmailService();
    const smtpError = new Error('Yandex SMTP rejected message');
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

  it('looks up the feedback author and sends links to S3 media', async () => {
    const storage = {
      getOwnedKey: jest.fn().mockReturnValue('user-1/feedback/2026-09-17/feedback-1/screen.jpg'),
      deleteObjectByKey: jest.fn(),
    };
    const service = new EmailService(prisma as never, undefined, storage as never);
    const feedback = {
      feedbackId: 'feedback-1',
      kind: 'bug',
      text: 'Something <wrong>',
      deviceInfo: 'Android\nPixel',
      attachments: [{ url: 'https://cdn.example/user-1/feedback/2026-09-17/feedback-1/screen.jpg', thumbnail: null }],
    };

    await service.sendFeedback(feedback, 'user-1');

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { email: true, profile: { select: { name: true, surname: true } } },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'aovoronin.piano@gmail.com',
        subject: '[Runich] Поведать о баге от Ann Runner <ann@example.com>',
        html: expect.stringContaining('Пользователь:</b> Ann Runner'),
      }),
    );
    const sentMessage = sendMail.mock.calls.at(-1) as unknown as [{ html: string }];
    expect(sentMessage[0].html).toContain('Something &lt;wrong&gt;');
    expect(sentMessage[0].html).toContain('Вложение 1');
    expect(sentMessage[0].html).not.toContain('userId');
  });

  it('keeps validated feedback media when SMTP delivery fails', async () => {
    const storage = {
      getOwnedKey: jest.fn().mockReturnValue('user-1/feedback/2026-09-17/feedback-1/screen.jpg'),
      deleteObjectByKey: jest.fn(),
    };
    const service = new EmailService(prisma as never, undefined, storage as never);
    sendMail.mockRejectedValueOnce(new Error('SMTP failed'));

    await expect(
      service.sendFeedback(
        {
          feedbackId: 'feedback-1',
          kind: 'bug',
          text: 'Broken',
          deviceInfo: 'Android',
          attachments: [{ url: 'https://cdn.example/screen.jpg', thumbnail: null }],
        },
        'user-1',
      ),
    ).rejects.toThrow('SMTP failed');
    expect(storage.deleteObjectByKey).not.toHaveBeenCalled();
  });

  it('rejects feedback attachments when S3 storage is not configured', async () => {
    const service = new EmailService(prisma as never);

    await expect(
      service.sendFeedback(
        {
          feedbackId: 'feedback-1',
          kind: 'bug',
          text: 'Broken',
          deviceInfo: 'Android',
          attachments: [{ url: 'https://cdn.example/screen.jpg' }],
        },
        'user-1',
      ),
    ).rejects.toThrow('S3-хранилище не настроено для вложений feedback');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('fails closed if feedback attachment validation has no storage service', () => {
    const service = new EmailService(prisma as never);
    const validateFeedbackAttachment = (
      service as unknown as {
        validateFeedbackAttachment: (userId: string, feedbackId: string, url: string) => string;
      }
    ).validateFeedbackAttachment.bind(service);

    expect(() => validateFeedbackAttachment('user-1', 'feedback-1', 'https://cdn.example/file.jpg')).toThrow(
      'S3-хранилище не настроено',
    );
  });

  it('rejects feedback attachments from another feedback folder', async () => {
    const storage = {
      getOwnedKey: jest.fn().mockReturnValue('user-1/feedback/2026-09-17/another-feedback/screen.jpg'),
      deleteObjectByKey: jest.fn(),
    };
    const service = new EmailService(prisma as never, undefined, storage as never);

    await expect(
      service.sendFeedback(
        {
          feedbackId: 'feedback-1',
          kind: 'bug',
          text: 'Broken',
          deviceInfo: 'Android',
          attachments: [{ url: 'https://cdn.example/screen.jpg' }],
        },
        'user-1',
      ),
    ).rejects.toThrow('Вложение feedback имеет некорректный S3-путь');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects feedback when the authenticated user no longer exists', async () => {
    findUnique.mockResolvedValue(null);
    const service = new EmailService(prisma as never);

    await expect(
      service.sendFeedback(
        { feedbackId: 'feedback-1', kind: 'thanks', text: 'Thanks', deviceInfo: 'iOS' },
        'missing-user',
      ),
    ).rejects.toThrow('Пользователь для feedback не найден');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects feedback when Prisma is not configured', async () => {
    const service = new EmailService();

    await expect(
      service.sendFeedback({ feedbackId: 'feedback-1', kind: 'bug', text: 'Broken', deviceInfo: 'Android' }, 'user-1'),
    ).rejects.toThrow('PrismaService не настроен для отправки feedback');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('uses a fallback author name when the feedback profile is empty', async () => {
    findUnique.mockResolvedValue({ email: 'ann@example.com', profile: null });
    const service = new EmailService(prisma as never);

    await service.sendFeedback(
      { feedbackId: 'feedback-1', kind: 'unknown', text: 'Thanks', deviceInfo: 'iOS' },
      'user-1',
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[Runich] Обратная связь от Имя не указано <ann@example.com>',
        html: expect.stringContaining('Пользователь:</b> Имя не указано'),
      }),
    );
  });
});
