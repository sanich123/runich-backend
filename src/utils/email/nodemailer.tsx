import nodemailer from 'nodemailer';

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
