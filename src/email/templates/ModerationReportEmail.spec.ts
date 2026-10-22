import React from 'react';
import { render } from '@react-email/components';
import { EmailButton } from './EmailButton';
import { ModerationReportEmail } from './ModerationReportEmail';
import type { ModerationReportEmailProps } from './ModerationReportEmail';

function collectText(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) {
    return collectText((node.props as { children?: React.ReactNode }).children);
  }
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

function findModeratorDashboardLink(node: React.ReactNode): { href: string } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const link = findModeratorDashboardLink(child);
      if (link) return link;
    }
    return undefined;
  }
  if (!React.isValidElement(node)) return undefined;
  if (node.type === EmailButton) return node.props as { href: string };
  return findModeratorDashboardLink((node.props as { children?: React.ReactNode }).children);
}

function renderEmail(props: ModerationReportEmailProps) {
  return ModerationReportEmail(props);
}

describe('ModerationReportEmail', () => {
  it('builds a report email with the moderator dashboard link and readable labels', () => {
    const email = renderEmail({
      reportId: 'report-1',
      requestType: 'report',
      targetType: 'activity',
      reason: 'harassment',
    });

    expect(collectText(email)).toContain('Новая жалоба в Runich');
    expect(collectText(email)).toContain('Тип контента: Тренировка');
    expect(collectText(email)).toContain('Причина: Преследование');
    expect(findModeratorDashboardLink(email)?.href).toBe('http://localhost:5173/profile/moderation?reportId=report-1');
  });

  it('builds an appeal email with an appeal deep link and omits report-only details', () => {
    const email = renderEmail({
      reportId: 'report-2',
      appealId: 'appeal-2',
      requestType: 'appeal',
      targetType: 'unused',
      reason: 'unused',
    });

    expect(collectText(email)).toContain('Новая апелляция в Runich');
    expect(collectText(email)).toContain('Поступила апелляция по жалобе report-2');
    expect(findModeratorDashboardLink(email)?.href).toContain('showAppeals=true');
    expect(findModeratorDashboardLink(email)?.href).toContain('appealId=appeal-2');
    expect(collectText(email)).not.toContain('Тип контента:');
  });

  it('falls back to unknown labels and supports appeals without an appeal id', () => {
    const reportEmail = renderEmail({
      reportId: 'report-3',
      requestType: 'report',
      targetType: 'unknown-target',
      reason: 'unknown-reason',
    });
    const appealEmail = renderEmail({
      reportId: 'report-4',
      requestType: 'appeal',
      targetType: 'unused',
      reason: 'unused',
    });

    expect(collectText(reportEmail)).toContain('Тип контента: unknown-target');
    expect(collectText(reportEmail)).toContain('Причина: unknown-reason');
    expect(findModeratorDashboardLink(appealEmail)?.href).toContain('showAppeals=true');
    expect(findModeratorDashboardLink(appealEmail)?.href).not.toContain('appealId=');
  });

  it('includes reporter details and the reported profile in a user report', async () => {
    const html = await render(
      renderEmail({
        reportId: 'report-profile',
        requestType: 'report',
        targetType: 'user',
        reason: 'harassment',
        reporterDetails: 'Repeated unwanted messages',
        reportedProfile: {
          name: 'Alex',
          surname: 'Runner',
          bio: 'Runner profile',
          profilePhoto: 'https://cdn.example/profile.jpg',
        },
      }),
    );

    expect(html).toContain('Repeated unwanted messages');
    expect(html).toContain('Профиль, на который пожаловались');
    expect(html).toContain('src="https://cdn.example/profile.jpg"');
    expect(html).toContain('Alex Runner');
    expect(html).toContain('Runner profile');
  });

  it('uses fallbacks when the reported profile has no public details', async () => {
    const html = await render(
      renderEmail({
        reportId: 'report-empty-profile',
        requestType: 'report',
        targetType: 'user',
        reason: 'other',
        reportedProfile: { name: null, surname: null, bio: null, profilePhoto: null },
      }),
    );

    expect(html).toContain('не указаны');
    expect(html).toContain('Описание:');
    expect(html).toContain('не указано');
    expect(html).not.toContain('<img alt="Фото профиля"');
  });
});
