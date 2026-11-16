import { render } from '@react-email/components';
import { NewFeedbackEmail } from './NewFeedbackEmail';

function collectText(html: string) {
  return html.replace(/<!--.*?-->/g, '').replace(/<[^>]*>/g, ' ');
}

describe('NewFeedbackEmail', () => {
  it('shows a known kind, topic, and attachment link', async () => {
    const html = await render(
      NewFeedbackEmail({
        requestId: 'feedback-1',
        kind: 'bug',
        topic: 'maps',
        email: 'runner@example.com',
        text: 'The map is blank.',
        deviceInfo: 'Android',
        attachments: [{ url: 'https://cdn.example/screen.jpg' }],
        adminUrl: 'https://runich.app/admin?feedbackId=feedback-1',
      }),
    );
    const text = collectText(html);

    expect(text).toContain('Сообщение об ошибке');
    expect(text).toContain('Тема: maps');
    expect(text).toContain('Вложение 1');
    expect(html).toContain('href="https://cdn.example/screen.jpg"');
    expect(html).toContain('href="https://runich.app/admin?feedbackId=feedback-1"');
  });

  it('falls back to an unknown kind and omits absent topic and attachments', async () => {
    const html = await render(
      NewFeedbackEmail({
        requestId: 'feedback-2',
        kind: 'legacy-kind',
        email: 'runner@example.com',
        text: 'A question.',
        deviceInfo: 'iOS',
        attachments: [],
        adminUrl: 'https://runich.app/admin?feedbackId=feedback-2',
      }),
    );
    const text = collectText(html);

    expect(text).toContain('legacy-kind');
    expect(text).not.toContain('Тема:');
    expect(text).not.toContain('Вложение 1');
  });
});
