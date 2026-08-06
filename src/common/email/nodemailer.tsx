import { existsSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

import { RUNICH_LOGO_CID } from './constants';

const smtpUser = () => process.env.SMTP_USER;
const smtpPassword = () => process.env.SMTP_PASSWORD;

function getTransporter() {
  const user = smtpUser();
  const password = smtpPassword();

  if (!user) {
    throw new Error('SMTP_USER must be configured');
  }

  if (!password) {
    throw new Error('SMTP_PASSWORD must be configured with a Yandex app password');
  }

  const port = Number(process.env.SMTP_PORT ?? 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SMTP_PORT must be a valid TCP port, got: ${process.env.SMTP_PORT}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.yandex.ru',
    port,
    secure: (process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true',
    auth: { user, pass: password },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT ?? 15000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT ?? 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT ?? 20000),
  });
}

export const sendEmail = async (email: string, subject: string, html: string) => {
  try {
    const user = smtpUser();

    const logoPath = join(process.cwd(), 'assets/images/runich-logo.png');

    if (!existsSync(logoPath)) {
      throw new Error(`Email logo file not found: ${logoPath}`);
    }

    const transporter = getTransporter();

    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Runich <${user}>`,
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
      ],
    });

    console.log('[Email] SMTP accepted message', {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
      to: email,
    });
  } catch (err) {
    console.error('[Email] SMTP sending failed', {
      to: email,
      subject,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    });
    throw err;
  }
};
