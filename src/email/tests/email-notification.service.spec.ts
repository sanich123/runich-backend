import { jest } from '@jest/globals';
import { render } from '@react-email/components';
import { EmailType } from '../templates/types';

const sendEmail = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('src/common/email/nodemailer', () => ({ sendEmail }));

const { EmailNotificationService } = await import('../email-notification.service');
const { NotificationEmail } = await import('../templates/NotificationEmail');

describe('EmailNotificationService', () => {
  const originalRedirectUri = process.env.AUTH_FRONTEND_REDIRECT_URI;

  beforeEach(() => {
    process.env.AUTH_FRONTEND_REDIRECT_URI = 'https://frontend.example/login?from=email#anchor';
    sendEmail.mockClear();
  });

  afterAll(() => {
    if (originalRedirectUri === undefined) delete process.env.AUTH_FRONTEND_REDIRECT_URI;
    else process.env.AUTH_FRONTEND_REDIRECT_URI = originalRedirectUri;
  });

  it('sends all activity notification types with recipient details and activity links', async () => {
    const service = new EmailNotificationService();
    const payload = {
      activityId: 'activity-123',
      actorName: 'Alice',
      actorSurname: 'Runner',
      actorProfilePhoto: 'https://cdn.example/alice.jpg',
      recipientEmail: 'owner@example.com',
      recipientName: 'Bob',
      recipientSurname: 'Owner',
      mapPhotoUrl: 'https://cdn.example/activity-map.jpg',
    };

    await service.sendLike(payload);
    await service.sendComment({ ...payload, comment: 'Nice route' });
    await service.sendCommentLike({ ...payload, comment: 'Great activity' });

    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      'owner@example.com',
      'Лайк к активности',
      expect.stringContaining('https://frontend.example/activity/activity-123'),
      [],
      undefined,
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      'owner@example.com',
      'Новый комментарий к вашей активности',
      expect.stringContaining('Nice route'),
      [],
      undefined,
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      3,
      'owner@example.com',
      'Лайк к вашему комментарию',
      expect.stringContaining('Great activity'),
      [],
      undefined,
    );
    for (const [, , html] of sendEmail.mock.calls) {
      expect(html).toContain('Bob');
      expect(html).toContain('Owner');
      expect(html).toContain('https://cdn.example/alice.jpg');
      expect(html).toContain('https://cdn.example/activity-map.jpg');
      expect(html).not.toContain('from=email');
      expect(html).not.toContain('#anchor');
    }
  });

  it('renders fallback actor details when optional payload fields are empty', async () => {
    const service = new EmailNotificationService();

    await service.sendLike({
      activityId: 'activity-456',
      actorName: null,
      actorSurname: null,
      actorProfilePhoto: null,
      recipientEmail: 'owner@example.com',
      recipientName: null,
      recipientSurname: null,
      mapPhotoUrl: null,
    });

    const html = sendEmail.mock.calls[0]?.[2] as string;
    expect(html).toContain('Привет,');
    expect(html).toContain('>R</td>');
    expect(html).not.toContain('Изображение активности');
  });

  it('renders a map without an activity URL using the application fallback', async () => {
    const html = await render(
      NotificationEmail({
        type: EmailType.comment,
        name: 'Alice',
        surname: 'Runner',
        mapPhotoUrl: 'https://cdn.example/map.jpg',
        comment: 'Nice route',
      }),
    );

    expect(html).toContain('Nice route');
    expect(html).toContain('alt="Изображение активности"');
    expect(html).toContain('https://runich-app.ru');
    expect(html).toContain('Открыть приложение Runich');
  });

  it('sends localized moderation emails only to the moderation mailbox', async () => {
    const service = new EmailNotificationService();

    await service.sendReporterModerationUpdate({
      reportId: 'report-1',
      targetType: 'activity',
      reason: 'spam',
      requestType: 'received',
      locale: 'russian',
    });
    await service.sendReporterModerationUpdate({
      reportId: 'report-2',
      targetType: 'comment',
      reason: 'harassment',
      requestType: 'decision',
      locale: 'english',
      outcome: 'confirmed',
    });

    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      'runich.app@yandex.ru',
      '[Runich] Жалоба принята',
      expect.stringContaining('Жалоба принята к рассмотрению'),
      [],
      undefined,
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      'runich.app@yandex.ru',
      '[Runich] Report decision',
      expect.stringContaining('We confirmed a violation'),
      [],
      undefined,
    );
  });

  it('sends report and appeal updates only to the moderation mailbox', async () => {
    const service = new EmailNotificationService();

    await service.sendModerationUpdate({
      reportId: 'report-1',
      requestType: 'report',
      targetType: 'activity',
      reason: 'spam',
    });
    await service.sendModerationUpdate({
      reportId: 'report-2',
      appealId: 'appeal-1',
      requestType: 'appeal',
      targetType: 'comment',
      reason: 'appeal',
    });

    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      'runich.app@yandex.ru',
      '[Runich] Жалоба на тренировку',
      expect.stringContaining('report-1'),
      [],
      undefined,
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      'runich.app@yandex.ru',
      '[Runich] Новая апелляция',
      expect.stringContaining('appeal-1'),
      [],
      undefined,
    );
  });

  it('uses clear target-specific moderation subjects', async () => {
    const service = new EmailNotificationService();

    await service.sendModerationUpdate({
      reportId: 'report-comment',
      requestType: 'report',
      targetType: 'comment',
      reason: 'harassment',
    });
    await service.sendModerationUpdate({
      reportId: 'report-upload',
      requestType: 'report',
      targetType: 'media_upload',
      reason: 'sexual_content',
    });

    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      'runich.app@yandex.ru',
      '[Runich] Жалоба на комментарий',
      expect.any(String),
      [],
      undefined,
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      'runich.app@yandex.ru',
      '[Runich] Жалоба на фото или видео',
      expect.any(String),
      [],
      undefined,
    );
  });
});
