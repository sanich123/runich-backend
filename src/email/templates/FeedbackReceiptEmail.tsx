import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';
import { emailStyles } from './const';
import { formatFeedbackDateTime } from '../format-feedback-date-time';

export function FeedbackReceiptEmail({ createdAt }: { createdAt: Date | string }) {
  return (
    <EmailLayout preview="Обращение принято" locale="russian">
      <Heading as="h1" style={emailStyles.title}>
        Мы получили ваше обращение
      </Heading>
      <Text style={emailStyles.paragraph}>
        Команда Runich рассмотрит сообщение и ответит на этот адрес электронной почты.
      </Text>
      <Text style={emailStyles.paragraph}>Дата и время обращения: {formatFeedbackDateTime(createdAt)}</Text>
    </EmailLayout>
  );
}
