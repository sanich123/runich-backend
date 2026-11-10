import { Heading, Text } from '@react-email/components';
import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';

export function GroupJoinRequestEmail({
  locale,
  preview,
  heading,
  greeting,
  body,
  button,
  requestsUrl,
}: {
  locale: 'russian' | 'english';
  preview: string;
  heading: string;
  greeting: string;
  body: string;
  button: string;
  requestsUrl: string;
}) {
  return (
    <EmailLayout preview={preview} locale={locale}>
      <Heading as="h1" style={{ color: '#292929', fontSize: '24px', margin: '0 0 24px' }}>
        {heading}
      </Heading>
      <Text style={{ color: '#292929', fontSize: '16px', lineHeight: '24px' }}>{greeting}</Text>
      <Text style={{ color: '#292929', fontSize: '16px', lineHeight: '24px' }}>{body}</Text>
      <EmailButton href={requestsUrl}>{button}</EmailButton>
    </EmailLayout>
  );
}
