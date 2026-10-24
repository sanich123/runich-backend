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

    expect(collectText(email)).toContain('Жалоба на тренировку в Runich');
    expect(collectText(email)).toContain('Тип контента: Тренировка');
    expect(collectText(email)).toContain('Причина: Преследование');
    expect(findModeratorDashboardLink(email)?.href).toBe('http://localhost:5173/admin?reportId=report-1');
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

  it.each([
    ['comment', 'Жалоба на комментарий в Runich', 'Тип контента: Комментарий'],
    ['media', 'Жалоба на фото или видео в Runich', 'Тип контента: Фото или видео'],
    ['media_upload', 'Жалоба на фото или видео в Runich', 'Тип контента: Фото или видео'],
  ] as const)('identifies a %s report in its title and content type', (targetType, title, contentType) => {
    const email = renderEmail({ reportId: `report-${targetType}`, requestType: 'report', targetType, reason: 'spam' });

    expect(collectText(email)).toContain(title);
    expect(collectText(email)).toContain(contentType);
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
    const email = renderEmail({
      reportId: 'report-profile',
      requestType: 'report',
      targetType: 'user',
      targetId: 'profile-1',
      reason: 'harassment',
      reporterDetails: 'Repeated unwanted messages',
      reporter: { id: 'reporter-1', name: 'Sam', surname: 'Reporter' },
      reportedUser: { id: 'reported-user-1', name: 'Alex', surname: 'Runner' },
      reportedContent: 'Runner profile',
      reportedProfile: {
        name: 'Alex',
        surname: 'Runner',
        bio: 'Runner profile',
        profilePhoto: 'https://cdn.example/profile.jpg',
      },
    });
    const text = collectText(email);
    const html = await render(email);

    expect(text).toContain('Repeated unwanted messages');
    expect(text).toContain('Кто пожаловался: Sam Reporter (ID: reporter-1)');
    expect(text).toContain('ID контента: profile-1');
    expect(text).toContain('Автор контента: Alex Runner (ID: reported-user-1)');
    expect(text).toContain('Профиль, на который пожаловались');
    expect(html).toContain('src="https://cdn.example/profile.jpg"');
    expect(text).toContain('Alex Runner');
    expect(text).toContain('Runner profile');
  });

  it('identifies an automatic media review and falls back to the uploader email', () => {
    const email = renderEmail({
      reportId: 'report-media-upload',
      requestType: 'report',
      targetType: 'media_upload',
      targetId: 'asset-1',
      reason: 'sexual_content',
      reporterDetails: 'Автоматическая проверка NSFWJS: Porn=0.99.',
      reportedUser: { id: 'owner-1', email: 'owner@example.com' },
    });
    const text = collectText(email);

    expect(text).toContain('Источник: автоматическая проверка NSFWJS');
    expect(text).toContain('Тип контента: Фото или видео');
    expect(text).toContain('Автор контента: owner@example.com (ID: owner-1)');
    expect(text).not.toContain('Кто пожаловался:');
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
