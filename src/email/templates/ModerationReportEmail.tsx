import { Heading, Text } from '@react-email/components';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';

export interface ModerationReportEmailProps {
  reportId: string;
  appealId?: string;
  requestType: 'report' | 'appeal';
  targetType: string;
  reason: string;
}

export function ModerationReportEmail({
  reportId,
  appealId,
  requestType,
  targetType,
  reason,
}: ModerationReportEmailProps) {
  const moderationUrl = new URL(getAuthFrontendRedirectUri());
  moderationUrl.pathname = '/profile/moderation';
  moderationUrl.search = '';
  moderationUrl.hash = '';
  moderationUrl.searchParams.set('reportId', reportId);
  if (requestType === 'appeal') {
    moderationUrl.searchParams.set('showAppeals', 'true');
    if (appealId) moderationUrl.searchParams.set('appealId', appealId);
  }

  const title = requestType === 'appeal' ? 'Новая апелляция' : 'Новая жалоба';
  const targetLabels: Record<string, string> = {
    activity: 'Тренировка',
    comment: 'Комментарий',
    media: 'Фото или видео',
    user: 'Профиль',
  };
  const reasonLabels: Record<string, string> = {
    threats: 'Угрозы',
    harassment: 'Преследование',
    hate_speech: 'Язык ненависти',
    sexual_content: 'Сексуальный контент',
    violence: 'Насилие',
    spam: 'Спам',
    other: 'Другое',
  };

  return (
    <EmailLayout preview={title}>
      <Heading as="h1" style={emailStyles.title}>
        {title} в Runich
      </Heading>
      <Text style={emailStyles.paragraph}>Поступило новое обращение на модерацию.</Text>
      {requestType === 'report' ? (
        <>
          <Text style={emailStyles.paragraph}>Тип контента: {targetLabels[targetType] ?? targetType}</Text>
          <Text style={emailStyles.paragraph}>Причина: {reasonLabels[reason] ?? reason}</Text>
        </>
      ) : (
        <Text style={emailStyles.paragraph}>Поступила апелляция по жалобе {reportId}.</Text>
      )}
      <EmailButton href={moderationUrl.toString()}>Открыть очередь модерации</EmailButton>
    </EmailLayout>
  );
}
