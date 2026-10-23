import { render } from '@react-email/components';
import { ReporterModerationEmail } from './ReporterModerationEmail';

describe('ReporterModerationEmail', () => {
  it.each([
    {
      locale: 'russian' as const,
      targetType: 'comment',
      reason: 'harassment',
      expected: [
        'Жалоба принята к рассмотрению',
        'Объект: комментарий',
        'Причина: преследование',
        'Номер жалобы: report-1',
      ],
    },
    {
      locale: 'english' as const,
      targetType: 'activity',
      reason: 'spam',
      expected: ['Report received for review', 'Reported item: activity', 'Reason: spam', 'Report ID: report-1'],
    },
  ])('renders a $locale receipt with localized labels', async ({ locale, targetType, reason, expected }) => {
    const html = await render(
      ReporterModerationEmail({
        reportId: 'report-1',
        targetType,
        reason,
        requestType: 'received',
        locale,
      }),
    );

    const visibleHtml = html.replace(/<!--.*?-->/g, '');
    for (const text of expected) expect(visibleHtml).toContain(text);
    expect(visibleHtml).toContain(locale === 'russian' ? '7 календарных дней' : '7 calendar days');
  });

  it.each([
    ['russian', 'confirmed', 'Нарушение подтверждено'],
    ['russian', 'not-confirmed', 'Нарушение не подтверждено'],
    ['russian', 'content-restored', 'Материал проверен и оставлен доступным'],
    ['english', 'confirmed', 'We confirmed a violation'],
    ['english', 'not-confirmed', 'We could not confirm a violation'],
    ['english', 'content-restored', 'The content was reviewed and remains available'],
  ] as const)('renders the %s decision outcome %s', async (locale, outcome, expected) => {
    const html = await render(
      ReporterModerationEmail({
        reportId: 'report-2',
        targetType: 'user',
        reason: 'threats',
        requestType: 'decision',
        locale,
        outcome,
      }),
    );
    const visibleHtml = html.replace(/<!--.*?-->/g, '');

    expect(visibleHtml).toContain(expected);
    expect(visibleHtml).toContain(locale === 'russian' ? 'профиль' : 'profile');
    expect(visibleHtml).toContain(locale === 'russian' ? 'угрозы' : 'threats');
  });

  it('falls back to unknown target and reason codes and treats an omitted decision outcome as not confirmed', async () => {
    const html = await render(
      ReporterModerationEmail({
        reportId: 'report-3',
        targetType: 'unknown-target',
        reason: 'unknown-reason',
        requestType: 'decision',
        locale: 'english',
      }),
    );
    const visibleHtml = html.replace(/<!--.*?-->/g, '');

    expect(visibleHtml).toContain('Reported item: unknown-target');
    expect(visibleHtml).toContain('Reason: unknown-reason');
    expect(visibleHtml).toContain('We could not confirm a violation');
  });
});
