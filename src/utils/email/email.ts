import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { htmlTemplate } from './html-template';

const AWS_CREDENTIALS = {
  region: 'eu-north-1',
  credentials: {
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    accessKeyId: process.env.AWS_ACCESS_KEY,
  },
};

export async function sendEmail(emailAddresses: string[], subject: string, body: string) {
  try {
    const params = {
      Source: 'send@runich.online',
      Destination: {
        ToAddresses: emailAddresses,
      },
      Message: {
        Subject: {
          Data: subject,
        },
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: htmlTemplate(body),
          },
        },
      },
    };
    const ses = new SESClient(AWS_CREDENTIALS);
    const command = new SendEmailCommand(params);
    return await ses.send(command);
  } catch (err) {
    console.log(err);
  }
}
