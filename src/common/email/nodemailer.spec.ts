import { jest } from '@jest/globals';

const sendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({ messageId: 'message-id' });
const createTransport = jest.fn(() => ({ sendMail }));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport },
}));

const { sendEmail } = await import('./nodemailer');

describe('sendEmail through Yandex SMTP', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.YANDEX_SMTP_USER = 'Runich.app@ya.ru';
    process.env.YANDEX_SMTP_PASSWORD = 'application-password';
    process.env.EMAIL_API_TIMEOUT = '15000';
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-id' });
    createTransport.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('sends a message with the inline logo and configured attachments', async () => {
    const attachment = {
      filename: 'feedback.jpg',
      content: Buffer.from('photo'),
      contentType: 'image/jpeg',
    };

    await sendEmail('runner@example.com', 'Тест', '<img src="cid:runich-logo@runich.app" />', [attachment]);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.yandex.ru',
      port: 465,
      secure: true,
      auth: {
        user: 'Runich.app@ya.ru',
        pass: 'application-password',
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Runich <Runich.app@ya.ru>',
        to: 'runner@example.com',
        subject: 'Тест',
        html: '<img src="cid:runich-logo@runich.app" />',
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: 'runich-logo.png',
            cid: 'runich-logo@runich.app',
            contentType: 'image/png',
          }),
          attachment,
        ]),
      }),
    );
  });

  it('propagates an SMTP authentication or delivery error', async () => {
    sendMail.mockRejectedValueOnce(new Error('Invalid login'));

    await expect(sendEmail('runner@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow('Invalid login');
    expect(console.error).toHaveBeenCalledWith(
      '[Email] Ошибка отправки через Yandex SMTP',
      expect.objectContaining({ to: 'runner@example.com', subject: 'Subject' }),
    );
  });

  it('reports missing Yandex SMTP configuration', async () => {
    delete process.env.YANDEX_SMTP_USER;

    await expect(sendEmail('runner@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
      'Не настроена обязательная переменная окружения: YANDEX_SMTP_USER',
    );

    process.env.YANDEX_SMTP_USER = 'Runich.app@ya.ru';
    delete process.env.YANDEX_SMTP_PASSWORD;

    await expect(sendEmail('runner@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
      'Не настроена обязательная переменная окружения: YANDEX_SMTP_PASSWORD',
    );
  });
});
