import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';

export interface ReporterModerationEmailProps {
  reportId: string;
  targetType: string;
  reason: string;
  requestType: 'received' | 'decision';
  locale: 'russian' | 'english';
  outcome?: 'confirmed' | 'not-confirmed' | 'content-restored';
}

export function ReporterModerationEmail({
  reportId,
  targetType,
  reason,
  requestType,
  locale,
  outcome,
}: ReporterModerationEmailProps) {
  const isRussian = locale === 'russian';
  const targetLabels: Record<string, string> = isRussian
    ? { activity: 'тренировка', comment: 'комментарий', media: 'фото или видео', user: 'профиль' }
    : { activity: 'activity', comment: 'comment', media: 'photo or video', user: 'profile' };
  const reasonLabels: Record<string, string> = isRussian
    ? {
        threats: 'угрозы',
        harassment: 'преследование',
        hate_speech: 'язык ненависти',
        sexual_content: 'сексуальный контент',
        violence: 'насилие',
        spam: 'спам',
        other: 'другое',
      }
    : {
        threats: 'threats',
        harassment: 'harassment',
        hate_speech: 'hate speech',
        sexual_content: 'sexual content',
        violence: 'violence',
        spam: 'spam',
        other: 'other',
      };
  const title =
    requestType === 'received'
      ? isRussian
        ? 'Жалоба принята к рассмотрению'
        : 'Report received for review'
      : isRussian
        ? 'Решение по жалобе'
        : 'Report decision';
  const result =
    outcome === 'content-restored'
      ? isRussian
        ? 'Материал проверен и оставлен доступным. Если появятся новые факты, отправьте новую жалобу с дополнительными сведениями.'
        : 'The content was reviewed and remains available. If you have new evidence, submit a new report with the added details.'
      : outcome === 'confirmed'
        ? isRussian
          ? 'Нарушение подтверждено. Меры приняты к контенту или аккаунту. Подробности санкций мы не раскрываем.'
          : 'We confirmed a violation and took action on the content or account. We do not share private sanction details.'
        : isRussian
          ? 'Нарушение не подтверждено. Если появятся новые факты, отправьте новую жалобу с дополнительными сведениями.'
          : 'We could not confirm a violation. If you have new evidence, submit a new report with the added details.';

  return (
    <EmailLayout preview={title} locale={locale}>
      <Heading as="h1" style={emailStyles.title}>
        {title}
      </Heading>
      <Text style={emailStyles.paragraph}>
        {isRussian ? 'Номер жалобы' : 'Report ID'}: {reportId}
      </Text>
      <Text style={emailStyles.paragraph}>
        {isRussian ? 'Объект' : 'Reported item'}: {targetLabels[targetType] ?? targetType}
      </Text>
      <Text style={emailStyles.paragraph}>
        {isRussian ? 'Причина' : 'Reason'}: {reasonLabels[reason] ?? reason}
      </Text>
      {requestType === 'received' ? (
        <Text style={emailStyles.paragraph}>
          {isRussian
            ? 'Мы проверим материалы и сообщим о результате в приложении и по электронной почте. Обычно рассмотрение занимает до 7 календарных дней. В сложных случаях срок может увеличиться.'
            : 'We will review the material and notify you in the app and by email. Reviews usually take up to 7 calendar days. Complex cases may take longer.'}
        </Text>
      ) : (
        <Text style={emailStyles.paragraph}>{result}</Text>
      )}
    </EmailLayout>
  );
}
