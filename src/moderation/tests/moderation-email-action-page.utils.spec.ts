import { renderModerationEmailActionPage } from '../moderation-email-action-page.utils';

describe('moderation email action confirmation page', () => {
  it('renders a confirmation form and escapes untrusted target and token values', () => {
    const page = renderModerationEmailActionPage({
      state: 'confirm',
      action: 'remove_content',
      targetType: '<script>alert(1)</script>',
      token: 'a" onsubmit="alert(1)',
    });

    expect(page).toContain('Удалить контент');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).toContain('a&quot; onsubmit=&quot;alert(1)');
    expect(page).toContain('method="post"');
    expect(page).toContain('Открытие этой страницы ничего не меняет');
  });

  it('keeps a confirmation form safe when the optional token is absent', () => {
    const page = renderModerationEmailActionPage({ state: 'confirm', action: 'hide_content' });

    expect(page).toContain('action="/moderation/email-actions/"');
    expect(page).toContain('объекта «контент»');
  });

  it.each([
    ['success', 'Жалоба закрыта'],
    ['unavailable', 'состояние контента изменилось'],
    ['expired', 'Ссылка недействительна'],
  ] as const)('renders the %s result', (state, text) => {
    const page = renderModerationEmailActionPage({ state, action: 'warn_user' });
    expect(page).toContain(text);
  });
});
