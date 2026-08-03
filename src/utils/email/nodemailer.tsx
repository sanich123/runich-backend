import { google } from 'googleapis';

const OAuth2 = google.auth.OAuth2;

const createGmailClient = async () => {
  const oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_SECRET,
    'https://developers.google.com/oauthplayground',
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const { token: accessToken } = await oauth2Client.getAccessToken();

  if (!accessToken) {
    throw new Error('Google did not return an access token');
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
};

export const sendEmail = async (email: string, subject: string, html: string) => {
  try {
    const gmail = await createGmailClient();
    const message = [
      `From: ${process.env.USER_EMAIL}`,
      `To: ${email}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      html,
    ].join('\r\n');
    const raw = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  } catch (err) {
    console.error('Email sending failed:', err);
    throw err;
  }
};
