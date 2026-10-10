import nodemailer from 'nodemailer';

const recipient = 'aovoronin.piano@gmail.com';
const environment = process.env.APP_ENV?.trim();
const sender = process.env.YANDEX_SMTP_USER?.trim();
const password = process.env.YANDEX_SMTP_PASSWORD;
const commit = process.env.DEPLOY_SHA?.trim();
const runUrl = process.env.DEPLOY_RUN_URL?.trim();

if (!['stage', 'production'].includes(environment)) {
  throw new Error('APP_ENV must be stage or production to send a deployment notice.');
}
if (!sender || !password) {
  throw new Error('YANDEX_SMTP_USER and YANDEX_SMTP_PASSWORD must be configured in the server environment.');
}
if (!commit || !runUrl) {
  throw new Error('DEPLOY_SHA and DEPLOY_RUN_URL must be provided for a deployment notice.');
}

const transporter = nodemailer.createTransport({
  host: 'smtp.yandex.ru',
  port: 465,
  secure: true,
  auth: { user: sender, pass: password },
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 15_000,
});

try {
  const info = await transporter.sendMail({
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

  if (!info.accepted?.length || info.rejected?.length) {
    throw new Error('SMTP did not accept the deployment notification recipient.');
  }

  console.log(`Deployment success email accepted by SMTP for ${environment}.`);
} finally {
  transporter.close();
}
