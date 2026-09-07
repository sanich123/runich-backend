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
  type FeedbackUser = {
    email: string;
    profile: { name: string | null; surname: string | null } | null;
  };
  const findUnique = jest.fn<() => Promise<FeedbackUser | null>>();
  const prisma = { users: { findUnique } };

  beforeEach(() => {
    process.env.YANDEX_SMTP_USER = 'Runich.app@ya.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'application-password';
    process.env.EMAIL_API_TIMEOUT = '5000';
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

  it('looks up the feedback author and sends the optional photo as an attachment', async () => {
    const service = new EmailService(undefined, prisma as never);
    const photo = {
      originalname: 'screen.jpg',
      buffer: Buffer.from('photo'),
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await service.sendFeedback('bug', 'user-1', 'Something <wrong>', 'Android\nPixel', photo);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { email: true, profile: { select: { name: true, surname: true } } },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'aovoronin.piano@gmail.com',
        subject: '[Runich] Поведать о баге от Ann Runner <ann@example.com>',
        html: expect.stringContaining('Пользователь:</b> Ann Runner'),
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: 'screen.jpg', content: photo.buffer, contentType: 'image/jpeg' }),
        ]),
      }),
    );
    const sentMessage = sendMail.mock.calls.at(-1) as unknown as [{ html: string }];
    expect(sentMessage[0].html).toContain('Something &lt;wrong&gt;');
    expect(sentMessage[0].html).not.toContain('userId');
  });

  it('rejects feedback when the authenticated user no longer exists', async () => {
    findUnique.mockResolvedValue(null);
    const service = new EmailService(undefined, prisma as never);

    await expect(service.sendFeedback('thanks', 'missing-user', 'Thanks', 'iOS')).rejects.toThrow(
      'Пользователь для feedback не найден',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
