import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

import { RUNICH_LOGO_CID } from './constants';

const YANDEX_SMTP_HOST = 'smtp.yandex.ru';
const YANDEX_SMTP_PORT = 465;
const EMAIL_API_TIMEOUT_MS = 15_000;
const DEVELOPMENT_ENVIRONMENT = 'development';

function getSmtpLocalAddress(): string | undefined {
  const configuredAddress = process.env.YANDEX_SMTP_LOCAL_ADDRESS?.trim();
  if (configuredAddress) return configuredAddress;
  if (process.env.NODE_ENV !== DEVELOPMENT_ENVIRONMENT) return undefined;

  const candidates = Object.entries(networkInterfaces())
    .filter(([name]) => !/^(lo|utun|tun|tap|ppp|docker|br-|veth)/i.test(name))
    .flatMap(([name, addresses]) =>
      (addresses ?? [])
        .filter((address) => !address.internal && address.family === 'IPv4')
        .map((address) => ({ name, address: address.address })),
    );

  const preferredCandidate = candidates.find(({ name }) => /^(en|eth|enp|wlan)/i.test(name));
  return (preferredCandidate ?? candidates[0])?.address;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не настроена обязательная переменная окружения: ${name}`);
  }
  return value;
}

let yandexTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function getYandexTransporter() {
  const userEmail = requiredEnvironmentVariable('YANDEX_SMTP_USER');
  const password = requiredEnvironmentVariable('YANDEX_SMTP_PASSWORD');

  if (!yandexTransporter) {
    const localAddress = getSmtpLocalAddress();
    const transportOptions = {
      host: YANDEX_SMTP_HOST,
      port: YANDEX_SMTP_PORT,
      secure: true,
      auth: {
        user: userEmail,
        pass: password,
      },
      connectionTimeout: EMAIL_API_TIMEOUT_MS,
      greetingTimeout: EMAIL_API_TIMEOUT_MS,
      socketTimeout: EMAIL_API_TIMEOUT_MS,
      ...(localAddress ? { localAddress } : {}),
    };

    yandexTransporter = nodemailer.createTransport(transportOptions);
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
