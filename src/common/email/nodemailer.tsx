import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

import { RUNICH_LOGO_CID } from './constants';
import { getAppEnvironment } from 'src/common/config/environment';
import type { LatencyMetricsService } from 'src/common/metrics/latency-metrics.service';

const YANDEX_SMTP_HOST = 'smtp.yandex.ru';
const YANDEX_SMTP_PORT = 465;
const MAILRU_SMTP_HOST = 'smtp.mail.ru';
const MAILRU_SMTP_PORT = 465;
const EMAIL_API_TIMEOUT_MS = 15_000;
const TRANSIENT_SMTP_ERROR_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'EDNS',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ESOCKET',
  'ETIMEDOUT',
]);

type SmtpProvider = {
  senderEmail: string;
  transporter: ReturnType<typeof nodemailer.createTransport>;
};

function getSmtpLocalAddress(): string | undefined {
  const configuredAddress = process.env.YANDEX_SMTP_LOCAL_ADDRESS?.trim();
  if (configuredAddress) return configuredAddress;
  if (process.env.NODE_ENV === 'test' || getAppEnvironment() !== 'local') return undefined;

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
let mailRuTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function createSmtpTransporter(host: string, port: number, userEmail: string, password: string) {
  const localAddress = getSmtpLocalAddress();
  return nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user: userEmail, pass: password },
    connectionTimeout: EMAIL_API_TIMEOUT_MS,
    greetingTimeout: EMAIL_API_TIMEOUT_MS,
    socketTimeout: EMAIL_API_TIMEOUT_MS,
    ...(localAddress ? { localAddress } : {}),
  });
}

function getYandexProvider(): SmtpProvider {
  const senderEmail = requiredEnvironmentVariable('YANDEX_SMTP_USER');
  const password = requiredEnvironmentVariable('YANDEX_SMTP_PASSWORD');

  yandexTransporter ??= createSmtpTransporter(YANDEX_SMTP_HOST, YANDEX_SMTP_PORT, senderEmail, password);
  return { senderEmail, transporter: yandexTransporter };
}

function hasMailRuSmtpConfiguration() {
  return Boolean(process.env.MAILRU_SMTP_USER?.trim() || process.env.MAILRU_SMTP_PASSWORD?.trim());
}

function getMailRuProvider(): SmtpProvider {
  const senderEmail = requiredEnvironmentVariable('MAILRU_SMTP_USER');
  const password = requiredEnvironmentVariable('MAILRU_SMTP_PASSWORD');

  mailRuTransporter ??= createSmtpTransporter(MAILRU_SMTP_HOST, MAILRU_SMTP_PORT, senderEmail, password);
  return { senderEmail, transporter: mailRuTransporter };
}

function isTransientSmtpError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const smtpError = error as { code?: unknown; responseCode?: unknown };
  if (typeof smtpError.responseCode === 'number' && smtpError.responseCode >= 400 && smtpError.responseCode < 500) {
    return true;
  }

  return typeof smtpError.code === 'string' && TRANSIENT_SMTP_ERROR_CODES.has(smtpError.code);
}

type EmailAttachment = { filename: string; content: Buffer; contentType?: string };

function emailMessage(
  senderEmail: string,
  email: string,
  subject: string,
  html: string,
  extraAttachments: EmailAttachment[] = [],
) {
  const logoPath = join(process.cwd(), 'assets/images/runich-logo.png');
  if (!existsSync(logoPath)) {
    throw new Error(`Файл логотипа письма не найден: ${logoPath}`);
  }

  return {
    from: `Runich <${senderEmail}>`,
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

export const sendEmail = async (
  email: string,
  subject: string,
  html: string,
  attachments: EmailAttachment[] = [],
  latencyMetrics?: LatencyMetricsService,
) => {
  const startedAt = performance.now();
  try {
    const yandex = getYandexProvider();
    try {
      await yandex.transporter.sendMail(emailMessage(yandex.senderEmail, email, subject, html, attachments));
      console.log('[Email] Yandex SMTP accepted message', { to: email, subject });
      return;
    } catch (yandexError) {
      if (!isTransientSmtpError(yandexError) || !hasMailRuSmtpConfiguration()) {
        console.error('[Email] Ошибка отправки через Yandex SMTP', {
          to: email,
          subject,
          error: yandexError instanceof Error ? { name: yandexError.name, message: yandexError.message } : yandexError,
        });
        throw yandexError;
      }

      console.warn('[Email] Yandex SMTP временно недоступен, переключаюсь на Mail.ru SMTP', {
        to: email,
        subject,
        error: yandexError instanceof Error ? { name: yandexError.name, message: yandexError.message } : yandexError,
      });

      try {
        const mailRu = getMailRuProvider();
        await mailRu.transporter.sendMail(emailMessage(mailRu.senderEmail, email, subject, html, attachments));
        console.log('[Email] Mail.ru SMTP accepted fallback message', { to: email, subject });
      } catch (mailRuError) {
        console.error('[Email] Ошибка отправки через резервный Mail.ru SMTP', {
          to: email,
          subject,
          yandexError:
            yandexError instanceof Error ? { name: yandexError.name, message: yandexError.message } : yandexError,
          mailRuError:
            mailRuError instanceof Error ? { name: mailRuError.name, message: mailRuError.message } : mailRuError,
        });
        throw new AggregateError([yandexError, mailRuError], 'Email delivery failed through Yandex and Mail.ru SMTP.', {
          cause: mailRuError,
        });
      }
    }
  } finally {
    latencyMetrics?.observeExternal('smtp', 'send', performance.now() - startedAt);
  }
};
