import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

export const OPERATIONAL_METRICS_RECIPIENT = 'aovoronin.piano@gmail.com';

const transientSmtpErrorCodes = new Set([
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

function isTransientSmtpError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const smtpError = error as { responseCode?: unknown; code?: unknown };
  if (typeof smtpError.responseCode === 'number' && smtpError.responseCode >= 400 && smtpError.responseCode < 500) {
    return true;
  }

  return typeof smtpError.code === 'string' && transientSmtpErrorCodes.has(smtpError.code);
}

function createTransporter(host: string, user: string, password: string) {
  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });
}

export function escapeHtml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export async function sendWithConfiguredSmtp(buildMessage: (sender: string) => SendMailOptions) {
  const yandexSender = process.env.YANDEX_SMTP_USER?.trim();
  const yandexPassword = process.env.YANDEX_SMTP_PASSWORD;
  const mailRuSender = process.env.MAILRU_SMTP_USER?.trim();
  const mailRuPassword = process.env.MAILRU_SMTP_PASSWORD;

  if (!yandexSender || !yandexPassword) {
    throw new Error('YANDEX_SMTP_USER and YANDEX_SMTP_PASSWORD must be configured in the server environment.');
  }

  const transporters: Transporter[] = [];
  const yandexTransporter = createTransporter('smtp.yandex.ru', yandexSender, yandexPassword);
  transporters.push(yandexTransporter);

  try {
    let info;
    let sendingProvider = 'Yandex';
    try {
      info = await yandexTransporter.sendMail(buildMessage(yandexSender));
    } catch (yandexError) {
      if (!isTransientSmtpError(yandexError) || (!mailRuSender && !mailRuPassword)) throw yandexError;

      if (!mailRuSender || !mailRuPassword) {
        throw new Error(
          'MAILRU_SMTP_USER and MAILRU_SMTP_PASSWORD must both be configured to enable Mail.ru fallback.',
        );
      }

      console.warn('Yandex SMTP is temporarily unavailable; trying Mail.ru SMTP.');
      const mailRuTransporter = createTransporter('smtp.mail.ru', mailRuSender, mailRuPassword);
      transporters.push(mailRuTransporter);
      info = await mailRuTransporter.sendMail(buildMessage(mailRuSender));
      sendingProvider = 'Mail.ru';
    }

    if (!info.accepted?.length || info.rejected?.length) {
      throw new Error('SMTP did not accept the operational metrics recipient.');
    }

    return sendingProvider;
  } finally {
    for (const transporter of transporters) transporter.close();
  }
}
