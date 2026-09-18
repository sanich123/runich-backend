import { jest } from '@jest/globals';
import { EMAIL_DELIVERY_NOTICE } from '../../common/email/constants';

const sendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({ messageId: 'message-id' });
const createTransport = jest.fn(() => ({ sendMail }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport },
}));

const { EmailService } = await import('../email.service');

const originalEnvironment = { ...process.env };

const baseEmail = {
  name: 'Ann',
  surname: 'Runner',
  profilePhoto: 'https://example.com/profile.jpg',
  activityId: 'a1',
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

  it('links notification emails to the activity and puts the login link before the confirmation code', async () => {
    const service = new EmailService();
    mockEmailDelivery();
    await service.sendLikeEmailNotification({ ...baseEmail, mapPhotoUrl: 'map', activityId: 'activity-1' });
    const notificationHtml = (sendMail.mock.calls.at(-1) as unknown as [{ html: string }])[0].html;
    expect(notificationHtml).toContain('/activity/activity-1');
    expect(notificationHtml).toContain('href="http://localhost:5173/activity/activity-1"');
    expect(notificationHtml).not.toContain('Откройте приложение Runich, чтобы посмотреть подробности.');
    expect(notificationHtml).toContain('Открыть активность в Runich');
    expect(notificationHtml).toContain('background-color:#F15A3E');

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

  it('looks up the feedback author and sends links to S3 media', async () => {
    const storage = {
      getOwnedKey: jest.fn().mockReturnValue('user-1/feedback/2026-09-17/feedback-1/screen.jpg'),
      deleteObjectByKey: jest.fn(),
    };
    const service = new EmailService(undefined, prisma as never, undefined, storage as never);
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
    const service = new EmailService(undefined, prisma as never, undefined, storage as never);
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
    const service = new EmailService(undefined, prisma as never);

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

  it('rejects feedback attachments from another feedback folder', async () => {
    const storage = {
      getOwnedKey: jest.fn().mockReturnValue('user-1/feedback/2026-09-17/another-feedback/screen.jpg'),
      deleteObjectByKey: jest.fn(),
    };
    const service = new EmailService(undefined, prisma as never, undefined, storage as never);

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
    const service = new EmailService(undefined, prisma as never);

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
    const service = new EmailService(undefined, prisma as never);

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
