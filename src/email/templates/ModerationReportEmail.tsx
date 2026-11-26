import { Heading, Img, Link, Section, Text } from '@react-email/components';
import { getAuthFrontendRedirectUri } from 'src/common/config/environment';
import { getModerationReportTitle } from '../email-notification.constants';
import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';

type ModerationEmailPerson = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  surname?: string | null;
  profilePhoto?: string | null;
};

export interface ModerationReportEmailProps {
  reportId: string;
  appealId?: string;
  requestType: 'report' | 'appeal';
  targetType: string;
  targetId?: string;
  reason: string;
  reporterDetails?: string | null;
  reporter?: ModerationEmailPerson | null;
  reportedUser?: ModerationEmailPerson | null;
  moderationActions?: Array<{ label: string; href: string }>;
  reportedContent?: string | null;
  reportedMediaUrl?: string | null;
  reportedMediaUrls?: string[];
  reportedVideoUrls?: string[];
  reportedActivity?: {
    title?: string | null;
    sport?: string | null;
    date?: string | null;
    distance?: number | null;
    duration?: number | null;
    locationName?: string | null;
    mapPhotoUrl?: string | null;
  } | null;
  reportedGroup?: { name?: string | null; locationName?: string | null } | null;
  reportedProfile?: {
    name?: string | null;
    surname?: string | null;
    bio?: string | null;
    profilePhoto?: string | null;
  } | null;
}

function formatActivityDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function formatActivityDuration(milliseconds?: number | null) {
  if (milliseconds == null || !Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const minutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} ч ${remainingMinutes} мин` : `${remainingMinutes} мин`;
}

function PersonDetails({ label, person }: { label: string; person?: ModerationEmailPerson | null }) {
  const safePerson = person ?? {};
  const fullName = [safePerson.name, safePerson.surname].filter(Boolean).join(' ');
  const name = fullName || 'не указаны';
  const initials =
    [safePerson.name, safePerson.surname]
      .filter(Boolean)
      .map((part) => Array.from(part ?? '')[0]?.toLocaleUpperCase('ru-RU'))
      .join('') || '•';

  return (
    <Section style={{ margin: '0 0 22px', padding: '16px', backgroundColor: '#FAFAF7', borderRadius: '12px' }}>
      <Text style={{ ...emailStyles.paragraph, fontWeight: 700, margin: '0 0 10px' }}>{label}</Text>
      {safePerson.profilePhoto ? (
        <Img
          src={safePerson.profilePhoto}
          alt={`Аватар: ${name}`}
          width="64"
          height="64"
          style={{ borderRadius: '32px', objectFit: 'cover', margin: '0 0 10px' }}
        />
      ) : (
        <Text
          style={{
            width: '64px',
            height: '64px',
            lineHeight: '64px',
            borderRadius: '32px',
            backgroundColor: '#E9E9E6',
            color: '#555555',
            fontSize: '24px',
            textAlign: 'center',
            margin: '0 0 10px',
          }}>
          {initials}
        </Text>
      )}
      <Text style={{ ...emailStyles.paragraph, margin: '0 0 4px' }}>Имя и фамилия: {name}</Text>
      <Text style={{ ...emailStyles.paragraph, margin: 0 }}>Email: {safePerson.email || 'не указан'}</Text>
    </Section>
  );
}

export function ModerationReportEmail({
  reportId,
  appealId,
  requestType,
  targetType,
  reason,
  reporterDetails,
  reporter,
  reportedUser,
  moderationActions,
  reportedContent,
  reportedMediaUrl,
  reportedMediaUrls,
  reportedVideoUrls,
  reportedActivity,
  reportedGroup,
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
  const targetLabels: Record<string, string> = {
    activity: 'Тренировка',
    activity_text: 'Текст тренировки',
    comment: 'Комментарий',
    group_post: 'Публикация группы',
    media: 'Фото или видео',
    media_upload: 'Фото или видео',
    user: 'Профиль',
    group: 'Группа',
  };
  const contentLabels: Record<string, string> = {
    activity: 'Описание тренировки',
    activity_text: 'Текст тренировки',
    comment: 'Текст комментария',
    group_post: 'Текст публикации',
    user: 'Описание профиля',
    group: 'Описание группы',
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
  const mediaUrls = [
    ...new Set([...(reportedMediaUrls ?? []), reportedMediaUrl].filter((url): url is string => !!url)),
  ];
  const isAutomaticTextReview = !reporter && ['activity_text', 'comment', 'group_post'].includes(targetType);
  const reportedProfilePhoto = reportedUser?.profilePhoto ?? reportedProfile?.profilePhoto;
  const reportedProfilePerson =
    reportedUser ??
    (reportedProfile
      ? {
          name: reportedProfile.name,
          surname: reportedProfile.surname,
          profilePhoto: reportedProfile.profilePhoto,
        }
      : null);
  const hasActivityDetails = Boolean(
    reportedActivity?.title ||
    reportedActivity?.sport ||
    reportedActivity?.date ||
    reportedActivity?.distance != null ||
    reportedActivity?.duration != null ||
    reportedActivity?.locationName,
  );
  const hasReportedContent = Boolean(
    reportedContent ||
    reportedProfile?.bio ||
    (targetType === 'user' && reportedProfilePhoto) ||
    reportedActivity?.mapPhotoUrl ||
    mediaUrls.length ||
    reportedVideoUrls?.length,
  );

  return (
    <EmailLayout preview={preview}>
      <Heading as="h1" style={emailStyles.title}>
        {preview}
      </Heading>
      <Text style={emailStyles.paragraph}>Поступило новое обращение на модерацию.</Text>
      {requestType === 'report' ? (
        <>
          {reporter ? (
            <PersonDetails label="Кто пожаловался" person={reporter} />
          ) : targetType === 'media_upload' ? (
            <Text style={emailStyles.paragraph}>Источник: автоматическая проверка медиа</Text>
          ) : isAutomaticTextReview ? (
            <Text style={emailStyles.paragraph}>Источник: автоматическая проверка текста</Text>
          ) : (
            <PersonDetails label="Кто пожаловался" person={null} />
          )}
          <Text style={emailStyles.paragraph}>Тип контента: {targetLabels[targetType] ?? targetType}</Text>
          {hasReportedContent ? (
            <>
              <Text style={{ ...emailStyles.paragraph, fontWeight: 700 }}>Контент, на который пожаловались:</Text>
              {reportedContent ? (
                <Text style={{ ...emailStyles.paragraph, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {contentLabels[targetType] ?? 'Содержимое'}: {reportedContent}
                </Text>
              ) : null}
              {targetType === 'user' && reportedProfilePhoto ? (
                <Img
                  src={reportedProfilePhoto}
                  alt="Фото профиля, на которое пожаловались"
                  width="480"
                  style={{ borderRadius: '8px', maxWidth: '100%', objectFit: 'contain', marginBottom: '18px' }}
                />
              ) : null}
              {reportedProfile?.bio && reportedContent !== reportedProfile.bio ? (
                <Text style={{ ...emailStyles.paragraph, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  Описание профиля: {reportedProfile.bio}
                </Text>
              ) : null}
              {reportedActivity?.mapPhotoUrl ? (
                <>
                  <Text style={emailStyles.paragraph}>Карта активности:</Text>
                  <Img
                    src={reportedActivity.mapPhotoUrl}
                    alt="Карта активности"
                    width="480"
                    style={{ borderRadius: '8px', maxWidth: '100%', objectFit: 'contain', marginBottom: '18px' }}
                  />
                </>
              ) : null}
              {mediaUrls.map((url, index) => (
                <Img
                  key={`${index}-${url}`}
                  src={url}
                  alt={`${targetLabels[targetType] ?? 'Контент'}: фото ${index + 1}`}
                  width="480"
                  style={{ borderRadius: '8px', maxWidth: '100%', objectFit: 'contain', marginBottom: '18px' }}
                />
              ))}
              {reportedVideoUrls?.map((url, index) => (
                <Text key={`${index}-${url}`} style={emailStyles.paragraph}>
                  Видео: <Link href={url}>открыть</Link>
                </Text>
              ))}
            </>
          ) : null}
          <PersonDetails
            label="Автор контента"
            person={
              reportedProfilePerson
                ? { ...reportedProfilePerson, profilePhoto: targetType === 'user' ? null : reportedProfilePhoto }
                : null
            }
          />
          {reportedGroup ? (
            <Text style={emailStyles.paragraph}>
              Группа: {[reportedGroup.name, reportedGroup.locationName].filter(Boolean).join(' · ') || 'не указана'}
            </Text>
          ) : null}
          {hasActivityDetails && reportedActivity ? (
            <>
              <Text style={emailStyles.paragraph}>
                {targetType === 'activity' || targetType === 'activity_text' ? 'Тренировка:' : 'Активность:'}
              </Text>
              {reportedActivity.title ? (
                <Text style={emailStyles.paragraph}>Название: {reportedActivity.title}</Text>
              ) : null}
              {reportedActivity.sport ? (
                <Text style={emailStyles.paragraph}>Вид спорта: {reportedActivity.sport}</Text>
              ) : null}
              {formatActivityDate(reportedActivity.date) ? (
                <Text style={emailStyles.paragraph}>Дата: {formatActivityDate(reportedActivity.date)}</Text>
              ) : null}
              {reportedActivity.distance != null ? (
                <Text style={emailStyles.paragraph}>Дистанция: {(reportedActivity.distance / 1000).toFixed(2)} км</Text>
              ) : null}
              {formatActivityDuration(reportedActivity.duration) ? (
                <Text style={emailStyles.paragraph}>Время: {formatActivityDuration(reportedActivity.duration)}</Text>
              ) : null}
              {reportedActivity.locationName ? (
                <Text style={emailStyles.paragraph}>Место: {reportedActivity.locationName}</Text>
              ) : null}
            </>
          ) : null}
          <Text style={emailStyles.paragraph}>Причина: {reasonLabels[reason] ?? reason}</Text>
          {reporterDetails ? (
            <Text style={{ ...emailStyles.paragraph, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              Пояснение: {reporterDetails}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={emailStyles.paragraph}>Поступила апелляция по жалобе {reportId}.</Text>
      )}
      {requestType === 'report' && moderationActions?.length ? (
        <>
          <Text style={{ ...emailStyles.paragraph, fontWeight: 700 }}>Действия модерации:</Text>
          <Text style={emailStyles.paragraph}>
            Каждая кнопка сначала откроет страницу подтверждения. Открытие ссылки само по себе не меняет статус.
          </Text>
          {moderationActions.map(({ label, href }) => (
            <EmailButton key={href} href={href}>
              {label}
            </EmailButton>
          ))}
        </>
      ) : null}
      <EmailButton href={moderationUrl.toString()}>Открыть очередь модерации</EmailButton>
    </EmailLayout>
  );
}
