import { existsSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

import { RUNICH_LOGO_CID } from './constants';

const YANDEX_SMTP_HOST = 'smtp.yandex.ru';
const YANDEX_SMTP_PORT = 465;

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не настроена обязательная переменная окружения: ${name}`);
  }
  return value;
}

function requestTimeout(): number {
  const timeout = Number(process.env.EMAIL_API_TIMEOUT ?? 15000);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`Таймаут EMAIL_API_TIMEOUT должен быть положительным числом: ${process.env.EMAIL_API_TIMEOUT}`);
  }
  return timeout;
}

let yandexTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function getYandexTransporter() {
  const userEmail = requiredEnvironmentVariable('YANDEX_SMTP_USER');
  const password = requiredEnvironmentVariable('YANDEX_SMTP_PASSWORD');

  if (!yandexTransporter) {
    const timeout = requestTimeout();
    yandexTransporter = nodemailer.createTransport({
      host: YANDEX_SMTP_HOST,
      port: YANDEX_SMTP_PORT,
      secure: true,
      auth: {
        user: userEmail,
        pass: password,
      },
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
    });
  }
  return yandexTransporter;
}

type EmailAttachment = { filename: string; content: Buffer; contentType?: string };

function emailMessage(email: string, subject: string, html: string, extraAttachments: EmailAttachment[] = []) {
  const userEmail = requiredEnvironmentVariable('YANDEX_SMTP_USER');
  const logoPath = join(process.cwd(), 'assets/images/runich-logo.png');
  if (!existsSync(logoPath)) {
    throw new Error(`Файл логотипа письма не найден: ${logoPath}`);
  }

  return {
    from: `Runich <${userEmail}>`,
    to: email,
    subject,
    html,
    attachments: [
      {
        filename: 'runich-logo.png',
        path: logoPath,
        cid: RUNICH_LOGO_CID,
        contentType: 'image/png',
      },
      ...extraAttachments,
    ],
  };
}

export const sendEmail = async (email: string, subject: string, html: string, attachments: EmailAttachment[] = []) => {
  try {
    await getYandexTransporter().sendMail(emailMessage(email, subject, html, attachments));
    console.log('[Email] Yandex SMTP accepted message', {
      to: email,
      subject,
    });
  } catch (err) {
    console.error('[Email] Ошибка отправки через Yandex SMTP', {
      to: email,
      subject,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    });
    throw err;
  }
};
