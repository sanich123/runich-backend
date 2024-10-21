import * as nodemailer from 'nodemailer';
import { google } from 'googleapis';

const OAuth2 = google.auth.OAuth2;

export const createTransporter = async () => {
  try {
    const oauth2Client = new OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_SECRET,
      'https://developers.google.com/oauthplayground',
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const accessToken = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) {
          console.log('*ERR: ', err);
          reject();
        }
        resolve(token);
      });
    });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.USER_EMAIL,
        accessToken,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      },
      // service: 'yandex',
      // auth: {
      //   user: 'Runich.app@yandex.ru',
      //   pass: 'pcqmyyykqeqwvieq',
      //   // pass: 'hwzzuifbvwkxdkle',
      // },
    });
    return transporter;
  } catch (err) {
    return err;
  }
};

export const sendEmail = async (email: string, subject: string, html: string) => {
  try {
    const emailTransporter = await createTransporter();
    await emailTransporter.sendMail({
      from: process.env.USER_EMAIL,
      to: email,
      subject,
      html,
    });
  } catch (err) {
    console.log('ERROR: ', err);
  }
};
