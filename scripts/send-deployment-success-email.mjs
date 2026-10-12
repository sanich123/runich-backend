import nodemailer from 'nodemailer';

const recipient = 'aovoronin.piano@gmail.com';
const environment = process.env.APP_ENV?.trim();
const yandexSender = process.env.YANDEX_SMTP_USER?.trim();
const yandexPassword = process.env.YANDEX_SMTP_PASSWORD;
const mailRuSender = process.env.MAILRU_SMTP_USER?.trim();
const mailRuPassword = process.env.MAILRU_SMTP_PASSWORD;
const commit = process.env.DEPLOY_SHA?.trim();
const runUrl = process.env.DEPLOY_RUN_URL?.trim();

if (!['stage', 'production'].includes(environment)) {
  throw new Error('APP_ENV must be stage or production to send a deployment notice.');
}
if (!yandexSender || !yandexPassword) {
  throw new Error('YANDEX_SMTP_USER and YANDEX_SMTP_PASSWORD must be configured in the server environment.');
}
if (!commit || !runUrl) {
  throw new Error('DEPLOY_SHA and DEPLOY_RUN_URL must be provided for a deployment notice.');
}

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

function isTransientSmtpError(error) {
  if (!error || typeof error !== 'object') return false;
  if (typeof error.responseCode === 'number' && error.responseCode >= 400 && error.responseCode < 500) return true;
  return typeof error.code === 'string' && transientSmtpErrorCodes.has(error.code);
}

function createTransporter(host, user, password) {
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

const transporters = [];
const yandexTransporter = createTransporter('smtp.yandex.ru', yandexSender, yandexPassword);
transporters.push(yandexTransporter);

try {
  const message = (sender) => ({
    from: `Runich <${sender}>`,
    to: recipient,
    subject: `[Runich] ${environment} deploy succeeded (${commit.slice(0, 7)})`,
    text: [
      'Runich deployment succeeded.',
      `Environment: ${environment}`,
      `Commit: ${commit}`,
      `GitHub Actions run: ${runUrl}`,
    ].join('\n'),
  });

  let info;
  let sendingProvider = 'Yandex';
  try {
    info = await yandexTransporter.sendMail(message(yandexSender));
  } catch (yandexError) {
    if (!isTransientSmtpError(yandexError) || (!mailRuSender && !mailRuPassword)) throw yandexError;

    if (!mailRuSender || !mailRuPassword) {
      throw new Error('MAILRU_SMTP_USER and MAILRU_SMTP_PASSWORD must both be configured to enable Mail.ru fallback.');
    }

    console.warn('Yandex SMTP is temporarily unavailable; trying Mail.ru SMTP.');
    const mailRuTransporter = createTransporter('smtp.mail.ru', mailRuSender, mailRuPassword);
    transporters.push(mailRuTransporter);
    info = await mailRuTransporter.sendMail(message(mailRuSender));
    sendingProvider = 'Mail.ru';
  }

  if (!info.accepted?.length || info.rejected?.length) {
    throw new Error('SMTP did not accept the deployment notification recipient.');
  }

  console.log(`Deployment success email accepted by ${sendingProvider} SMTP for ${environment}.`);
} finally {
  for (const transporter of transporters) transporter.close();
}
