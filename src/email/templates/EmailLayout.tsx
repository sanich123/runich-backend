import { Body, Container, Head, Html, Img, Preview, Section, Text } from '@react-email/components';

import { EMAIL_DELIVERY_NOTICE } from '../../common/email/constants';
import { emailLayoutStyles, emailLogoUrl } from './const';
import type { EmailLayoutProps } from './types';

export function EmailLayout({ preview, children }: EmailLayoutProps) {
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
            <Text style={emailLayoutStyles.footerNotice}>{EMAIL_DELIVERY_NOTICE}</Text>
            <Text style={emailLayoutStyles.footerText}>Вы получили это письмо, потому что использовали Runich.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
