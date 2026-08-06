import { jest } from '@jest/globals';
import { sendEmail } from './nodemailer';

describe('sendEmail through Gmail API', () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_SECRET = 'client-secret';
    process.env.GOOGLE_REFRESH_TOKEN = 'refresh-token';
    process.env.USER_EMAIL = 'runich.sender@gmail.com';
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('refreshes OAuth and sends a MIME message with the inline logo', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'message-id', threadId: 'thread-id' }), { status: 200 }),
      );
    global.fetch = fetchMock;

    await sendEmail('runner@example.com', 'Тест', '<img src="cid:runich-logo@runich.app" />');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenOptions] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(tokenOptions?.method).toBe('POST');
    expect(tokenOptions?.body?.toString()).toContain('refresh_token=refresh-token');

    const [gmailUrl, gmailOptions] = fetchMock.mock.calls[1];
    expect(gmailUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(gmailOptions?.headers).toEqual({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    });

    const { raw } = JSON.parse(gmailOptions?.body as string) as { raw: string };
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: Runich <runich.sender@gmail.com>');
    expect(mime).toContain('To: runner@example.com');
    expect(mime).toContain('Content-ID: <runich-logo@runich.app>');
    expect(mime).toContain('filename=runich-logo.png');
  });

  it('reports an OAuth rejection without making the Gmail request', async () => {
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));

    await expect(sendEmail('runner@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
      'Google OAuth returned 400: {"error":"invalid_grant"}',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
