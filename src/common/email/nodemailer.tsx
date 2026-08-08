import { existsSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

import { RUNICH_LOGO_CID } from './constants';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GOOGLE_REDIRECT_URI = 'https://developers.google.com/oauthplayground';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured`);
  }
  return value;
}

function requestTimeout(): number {
  const timeout = Number(process.env.EMAIL_API_TIMEOUT ?? 15000);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`EMAIL_API_TIMEOUT must be a positive number, got: ${process.env.EMAIL_API_TIMEOUT}`);
  }
  return timeout;
}

async function googleAccessToken(): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnvironmentVariable('GOOGLE_CLIENT_ID'),
      client_secret: requiredEnvironmentVariable('GOOGLE_SECRET'),
      refresh_token: requiredEnvironmentVariable('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(requestTimeout()),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Google OAuth returned ${response.status}: ${responseBody.slice(0, 1000)}`);
  }

  const { access_token: accessToken } = JSON.parse(responseBody) as { access_token?: string };
  if (!accessToken) {
    throw new Error('Google OAuth response does not contain an access token');
  }
  return accessToken;
}

async function rawEmail(email: string, subject: string, html: string): Promise<string> {
  const userEmail = requiredEnvironmentVariable('USER_EMAIL');
  const logoPath = join(process.cwd(), 'assets/images/runich-logo.png');
  if (!existsSync(logoPath)) {
    throw new Error(`Email logo file not found: ${logoPath}`);
  }

  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await composer.sendMail({
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
    ],
  });

  if (!result.message) {
    throw new Error('Nodemailer did not generate a MIME message');
  }
  return result.message.toString('base64url');
}

export const sendEmail = async (email: string, subject: string, html: string) => {
  try {
    const [accessToken, raw] = await Promise.all([googleAccessToken(), rawEmail(email, subject, html)]);
    const response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(requestTimeout()),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(`Gmail API returned ${response.status}: ${responseBody.slice(0, 1000)}`);
    }

    const result = JSON.parse(responseBody) as { id?: string; threadId?: string };
    console.log('[Email] Gmail API accepted message', {
      messageId: result.id,
      threadId: result.threadId,
      to: email,
    });
  } catch (err) {
    console.error('[Email] Gmail API sending failed', {
      to: email,
      subject,
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    });
    throw err;
  }
};
