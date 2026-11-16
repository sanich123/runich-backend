import { Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';
import { formatFeedbackDateTime } from '../format-feedback-date-time';

export function FeedbackReplyEmail({ createdAt, text }: { createdAt: Date | string; text: string }) {
  return (
    <EmailLayout preview="Ответ поддержки Runich" locale="russian">
      <Heading as="h1" style={emailStyles.title}>
        Ответ поддержки Runich
      </Heading>
      <Text style={emailStyles.paragraph}>Ответ на обращение от {formatFeedbackDateTime(createdAt)}</Text>
      <Section
        style={{ backgroundColor: '#FAFAF7', borderLeft: '3px solid #F15A3E', borderRadius: '12px', padding: '18px' }}>
        <Text style={{ ...emailStyles.paragraph, margin: 0, whiteSpace: 'pre-wrap' }}>{text}</Text>
      </Section>
      <Text style={{ ...emailStyles.paragraph, color: '#73736C', fontSize: '13px', marginTop: '22px' }}>
        Это письмо отправлено командой Runich.
      </Text>
    </EmailLayout>
  );
}
