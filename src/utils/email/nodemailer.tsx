import { existsSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

import { RUNICH_LOGO_CID } from './constants';

export const sendEmail = async (email: string, subject: string, html: string) => {
  try {
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpUser) {
      throw new Error('SMTP_USER must be configured');
    }

    if (!smtpPassword) {
      throw new Error('SMTP_PASSWORD must be configured with a Yandex app password');
    }

    const logoPath = join(process.cwd(), 'assets/images/runich-logo.png');

    if (!existsSync(logoPath)) {
      throw new Error(`Email logo file not found: ${logoPath}`);
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.yandex.ru',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Runich <${smtpUser}>`,
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
    });
  } catch (err) {
    console.error('Email sending failed:', err);
    throw err;
  }
};
