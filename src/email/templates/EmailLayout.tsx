import { Body, Container, Head, Html, Img, Preview, Section, Text } from '@react-email/components';

import { EMAIL_DELIVERY_NOTICE } from '../../common/email/constants';
import { emailLayoutStyles, emailLogoUrl } from './const';
import type { EmailLayoutProps } from './types';

export function EmailLayout({ preview, locale = 'russian', children }: EmailLayoutProps) {
  const footerNotice =
    locale === 'english'
      ? 'This email may land in your spam folder. If you cannot find it in your inbox, check spam and verify your email address.'
      : EMAIL_DELIVERY_NOTICE;
  const footerText =
    locale === 'english'
      ? 'You received this email because you use Runich.'
      : 'Вы получили это письмо, потому что использовали Runich.';

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailLayoutStyles.body}>
        <Container style={emailLayoutStyles.container}>
          <Section style={emailLayoutStyles.header}>
            <Img src={emailLogoUrl} width="56" height="56" alt="Runich" style={emailLayoutStyles.logo} />
          </Section>

          <Section style={emailLayoutStyles.content}>{children}</Section>

          <Section style={emailLayoutStyles.footer}>
            <Text style={emailLayoutStyles.footerNotice}>{footerNotice}</Text>
            <Text style={emailLayoutStyles.footerText}>{footerText}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
