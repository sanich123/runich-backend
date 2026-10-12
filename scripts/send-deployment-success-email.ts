import nodemailer from 'nodemailer';
import sharp from 'sharp';
import { DEPLOYMENT_TEST_ROUTE } from './deployment-test-route';
import { renderRunichVectorMap } from '../src/common/maps/static-map.vector';
import { calculateStaticMapViewport, getErrorMessage, validateStaticMap } from '../src/common/maps/static-map.utils';

const recipient = 'aovoronin.piano@gmail.com';
const mapContentId = 'runich-deployment-test-route@runich';
const environment = process.env.APP_ENV?.trim();
const yandexSender = process.env.YANDEX_SMTP_USER?.trim();
const yandexPassword = process.env.YANDEX_SMTP_PASSWORD;
const mailRuSender = process.env.MAILRU_SMTP_USER?.trim();
const mailRuPassword = process.env.MAILRU_SMTP_PASSWORD;
const commit = process.env.DEPLOY_SHA?.trim();
const runUrl = process.env.DEPLOY_RUN_URL?.trim();

if (environment !== 'stage' && environment !== 'production') {
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

function escapeHtml(value: string) {
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

async function renderDeploymentTestMap() {
  try {
    const viewport = calculateStaticMapViewport(DEPLOYMENT_TEST_ROUTE);
    const webpImage = await renderRunichVectorMap(DEPLOYMENT_TEST_ROUTE, viewport.center, viewport.zoom);
    await validateStaticMap(webpImage);

    const pngImage = await sharp(webpImage).png().toBuffer();
    const metadata = await sharp(pngImage).metadata();
    if (metadata.format !== 'png' || metadata.width !== 896 || metadata.height !== 538) {
      throw new Error('Generated route image has an unexpected format or size.');
    }

    return pngImage;
  } catch (error) {
    throw new Error(`Could not render the deployment test route map: ${getErrorMessage(error)}`, { cause: error });
  }
}

const transporters: ReturnType<typeof createTransporter>[] = [];
const yandexTransporter = createTransporter('smtp.yandex.ru', yandexSender, yandexPassword);
transporters.push(yandexTransporter);

try {
  const routeMap = await renderDeploymentTestMap();
  const message = (sender: string) => ({
    from: `Runich <${sender}>`,
    to: recipient,
    subject: `[Runich] ${environment} deploy succeeded (${commit.slice(0, 7)})`,
    text: [
      'Runich deployment succeeded.',
      `Environment: ${environment}`,
      `Commit: ${commit}`,
      `GitHub Actions run: ${runUrl}`,
      'The deployment test route map is included as an inline image.',
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html><body style="margin:0;padding:24px;background:#f4f6f8;color:#202a33;font:15px/1.5 Arial,sans-serif">',
      '<main style="max-width:896px;margin:0 auto;padding:24px;background:#fff;border-radius:12px">',
      '<h1 style="margin:0 0 16px;font-size:22px">Runich deployment succeeded</h1>',
      `<p style="margin:4px 0"><strong>Environment:</strong> ${escapeHtml(environment)}</p>`,
      `<p style="margin:4px 0"><strong>Commit:</strong> ${escapeHtml(commit)}</p>`,
      `<p style="margin:4px 0 20px"><a href="${escapeHtml(runUrl)}">GitHub Actions run</a></p>`,
      '<h2 style="margin:0 0 10px;font-size:17px">Deployment test route</h2>',
      `<img src="cid:${mapContentId}" width="896" alt="Map preview of the fixed deployment test route" style="display:block;width:100%;max-width:896px;height:auto;border-radius:8px">`,
      '</main></body></html>',
    ].join(''),
    attachments: [
      {
        filename: 'runich-deployment-test-route.png',
        content: routeMap,
        contentType: 'image/png',
        contentDisposition: 'inline' as const,
        cid: mapContentId,
      },
    ],
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

  console.log(`Deployment success email with route map accepted by ${sendingProvider} SMTP for ${environment}.`);
} finally {
  for (const transporter of transporters) transporter.close();
}
