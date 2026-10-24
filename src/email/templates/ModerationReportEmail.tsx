import { Heading, Img, Text } from '@react-email/components';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { getModerationReportTitle } from '../email-notification.constants';
import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';

export interface ModerationReportEmailProps {
  reportId: string;
  appealId?: string;
  requestType: 'report' | 'appeal';
  targetType: string;
  targetId?: string;
  reason: string;
  reporterDetails?: string | null;
  reporter?: { id?: string | null; name?: string | null; surname?: string | null } | null;
  reportedUser?: { id?: string | null; name?: string | null; surname?: string | null } | null;
  reportedContent?: string | null;
  reportedMediaUrl?: string | null;
  reportedProfile?: {
    name?: string | null;
    surname?: string | null;
    bio?: string | null;
    profilePhoto?: string | null;
  } | null;
}

export function ModerationReportEmail({
  reportId,
  appealId,
  requestType,
  targetType,
  targetId,
  reason,
  reporterDetails,
  reporter,
  reportedUser,
  reportedContent,
  reportedMediaUrl,
  reportedProfile,
}: ModerationReportEmailProps) {
  const moderationUrl = new URL(getAuthFrontendRedirectUri());
  moderationUrl.pathname = '/admin';
  moderationUrl.search = '';
  moderationUrl.hash = '';
  moderationUrl.searchParams.set('reportId', reportId);
  if (requestType === 'appeal') {
    moderationUrl.searchParams.set('showAppeals', 'true');
    if (appealId) moderationUrl.searchParams.set('appealId', appealId);
  }

  const title = requestType === 'appeal' ? 'Новая апелляция' : getModerationReportTitle(targetType);
  const preview = `${title} в Runich`;
  const reporterName = [reporter?.name, reporter?.surname].filter(Boolean).join(' ') || 'не указано';
  const reportedUserName = [reportedUser?.name, reportedUser?.surname].filter(Boolean).join(' ') || 'не указан';
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
    <EmailLayout preview={preview}>
      <Heading as="h1" style={emailStyles.title}>
        {preview}
      </Heading>
      <Text style={emailStyles.paragraph}>Поступило новое обращение на модерацию.</Text>
      {requestType === 'report' ? (
        <>
          <Text style={emailStyles.paragraph}>
            Кто пожаловался: {reporterName} (ID: {reporter?.id ?? 'не указан'})
          </Text>
          <Text style={emailStyles.paragraph}>Тип контента: {targetLabels[targetType] ?? targetType}</Text>
          <Text style={emailStyles.paragraph}>ID контента: {targetId ?? 'не указан'}</Text>
          <Text style={emailStyles.paragraph}>
            Автор контента: {reportedUserName} (ID: {reportedUser?.id ?? 'не указан'})
          </Text>
          {reportedContent ? <Text style={emailStyles.paragraph}>Содержимое: {reportedContent}</Text> : null}
          {reportedMediaUrl ? (
            <Img
              src={reportedMediaUrl}
              alt={targetLabels[targetType] ?? targetType}
              width="360"
              style={{ borderRadius: '8px', maxWidth: '100%', objectFit: 'contain' }}
            />
          ) : null}
          <Text style={emailStyles.paragraph}>Причина: {reasonLabels[reason] ?? reason}</Text>
          {reporterDetails ? <Text style={emailStyles.paragraph}>Пояснение: {reporterDetails}</Text> : null}
          {targetType === 'user' && reportedProfile ? (
            <>
              <Text style={emailStyles.paragraph}>Профиль, на который пожаловались:</Text>
              {reportedProfile.profilePhoto ? (
                <Img
                  src={reportedProfile.profilePhoto}
                  alt="Фото профиля"
                  width="96"
                  height="96"
                  style={{ borderRadius: '48px', objectFit: 'cover' }}
                />
              ) : null}
              <Text style={emailStyles.paragraph}>
                Имя и фамилия:{' '}
                {[reportedProfile.name, reportedProfile.surname].filter(Boolean).join(' ') || 'не указаны'}
              </Text>
              <Text style={emailStyles.paragraph}>Описание: {reportedProfile.bio || 'не указано'}</Text>
            </>
          ) : null}
        </>
      ) : (
        <Text style={emailStyles.paragraph}>Поступила апелляция по жалобе {reportId}.</Text>
      )}
      <EmailButton href={moderationUrl.toString()}>Открыть очередь модерации</EmailButton>
    </EmailLayout>
  );
}
