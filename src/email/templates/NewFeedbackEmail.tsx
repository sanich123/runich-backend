import { Heading, Link, Section, Text } from '@react-email/components';
import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';
import { formatFeedbackDateTime } from '../format-feedback-date-time';

export interface NewFeedbackEmailProps {
  createdAt: Date | string;
  kind: string;
  topic?: string | null;
  email: string;
  text: string;
  deviceInfo: string;
  attachments: Array<{ url: string; thumbnail?: string | null }>;
  adminUrl: string;
}

const kindLabels: Record<string, string> = {
  bug: 'Сообщение об ошибке',
  feature: 'Предложение функции',
  question: 'Вопрос в поддержку',
};

export function NewFeedbackEmail({
  createdAt,
  kind,
  topic,
  email,
  text,
  deviceInfo,
  attachments,
  adminUrl,
}: NewFeedbackEmailProps) {
  return (
    <EmailLayout preview={`Новое обращение Runich: ${kindLabels[kind] ?? kind}`} locale="russian">
      <Heading as="h1" style={emailStyles.title}>
        {kindLabels[kind] ?? kind}
      </Heading>
      <Text style={emailStyles.paragraph}>Дата и время обращения: {formatFeedbackDateTime(createdAt)}</Text>
      <Text style={emailStyles.paragraph}>
        Отправитель: <Link href={`mailto:${email}`}>{email}</Link>
      </Text>
      {topic ? <Text style={emailStyles.paragraph}>Тема: {topic}</Text> : null}
      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: '12px', padding: '18px' }}>
        <Text style={{ ...emailStyles.paragraph, margin: 0, whiteSpace: 'pre-wrap' }}>{text}</Text>
      </Section>
      <Text style={emailStyles.paragraph}>Устройство и приложение: {deviceInfo}</Text>
      {attachments.length ? (
        <Section>
          <Text style={{ ...emailStyles.paragraph, fontWeight: 700, marginBottom: '8px' }}>Вложения</Text>
          {attachments.map(({ url }, index) => (
            <Text key={`${url}-${index}`} style={emailStyles.paragraph}>
              <Link href={url}>Вложение {index + 1}</Link>
            </Text>
          ))}
        </Section>
      ) : null}
      <EmailButton href={adminUrl}>Открыть обращение в админке</EmailButton>
    </EmailLayout>
  );
}
