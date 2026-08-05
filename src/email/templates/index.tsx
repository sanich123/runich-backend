import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HEADING, NotificationEmailProps, PARAGRAPH } from './types';

const colors = {
  accent: '#F66767',
  accentDark: '#D94E59',
  background: '#FFF7F5',
  surface: '#FFFFFF',
  text: '#4D4D4D',
  muted: '#8A8585',
  border: '#F1DEDB',
  softAccent: '#FFF0EE',
};

const fontFamily = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";
const logoUrl = `data:image/png;base64,${readFileSync(join(process.cwd(), 'assets/images/runich-logo.png')).toString('base64')}`;

function getAuthLink(accessToken: string) {
  const protocol = process.env.IS_DEV ? 'http' : 'https';
  const host = process.env.IS_DEV ? 'localhost:8081' : 'runich.expo.app';
  return `${protocol}://${host}/sign-in?accessToken=${accessToken}`;
}

function EmailLayout({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.background,
          color: colors.text,
          fontFamily,
          margin: 0,
          padding: '32px 16px',
        }}
      >
        <Container style={{ margin: '0 auto', maxWidth: '560px', width: '100%' }}>
          <Section style={{ padding: '0 0 24px' }}>
            <Row>
              <Column style={{ width: '52px' }}>
                <Img src={logoUrl} width="44" height="44" alt="Runich" style={{ display: 'block' }} />
              </Column>
              <Column>
                <Text
                  style={{
                    color: colors.accent,
                    fontFamily,
                    fontSize: '25px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    lineHeight: '44px',
                    margin: 0,
                  }}
                >
                  Runich
                </Text>
              </Column>
            </Row>
          </Section>

          <Section
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: '20px',
              padding: '32px 32px 28px',
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: '24px 12px 0', textAlign: 'center' }}>
            <Text style={{ color: colors.muted, fontFamily, fontSize: '13px', lineHeight: '20px', margin: 0 }}>
              Runich — активности, которые хочется запомнить
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const titleStyle = {
  color: colors.text,
  fontFamily,
  fontSize: '26px',
  fontWeight: 700,
  lineHeight: '32px',
  margin: '0 0 12px',
};

const paragraphStyle = {
  color: colors.text,
  fontFamily,
  fontSize: '16px',
  lineHeight: '25px',
  margin: '0 0 18px',
};

const buttonStyle = {
  backgroundColor: colors.accent,
  borderRadius: '12px',
  color: colors.surface,
  display: 'inline-block',
  fontFamily,
  fontSize: '16px',
  fontWeight: 700,
  lineHeight: '22px',
  padding: '13px 22px',
  textDecoration: 'none',
};

export function ConfirmEmailAddressWithLinkAndCode({ text, accessToken }: { text: string; accessToken: string }) {
  const authLink = getAuthLink(accessToken);

  return (
    <EmailLayout preview="Подтвердите адрес электронной почты в Runich">
      <Heading as="h1" style={titleStyle}>
        Подтвердите email
      </Heading>
      <Text style={paragraphStyle}>
        Перейдите по ссылке, чтобы подтвердить адрес электронной почты и продолжить пользоваться Runich.
      </Text>
      <Section style={{ padding: '4px 0 24px', textAlign: 'center' }}>
        <Button href={authLink} style={buttonStyle}>
          Подтвердить email
        </Button>
      </Section>
      <Hr style={{ borderColor: colors.border, margin: '0 0 22px' }} />
      <Text style={{ color: colors.muted, fontFamily, fontSize: '14px', lineHeight: '21px', margin: '0 0 10px' }}>
        Или введите этот код в приложении:
      </Text>
      <Text
        style={{
          backgroundColor: colors.softAccent,
          borderRadius: '12px',
          color: colors.accentDark,
          fontFamily,
          fontSize: '30px',
          fontWeight: 700,
          letterSpacing: '8px',
          lineHeight: '42px',
          margin: 0,
          padding: '12px 16px',
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </EmailLayout>
  );
}

export function ResetPasswordByLinkAndCode({ accessToken }: { accessToken: string }) {
  return (
    <EmailLayout preview="Ссылка для входа в Runich">
      <Heading as="h1" style={titleStyle}>
        Вход в Runich
      </Heading>
      <Text style={paragraphStyle}>
        Используйте кнопку ниже, чтобы войти в приложение без пароля. Если вы не запрашивали эту ссылку, просто
        проигнорируйте письмо.
      </Text>
      <Section style={{ padding: '4px 0 8px', textAlign: 'center' }}>
        <Button href={getAuthLink(accessToken)} style={buttonStyle}>
          Войти в приложение
        </Button>
      </Section>
    </EmailLayout>
  );
}

export function NotificationEmail({
  type,
  name,
  surname,
  recepientName,
  recepientSurname,
  profilePhoto,
  mapPhotoUrl,
  comment,
}: NotificationEmailProps) {
  return (
    <EmailLayout preview={HEADING[type]}>
      <Heading as="h1" style={titleStyle}>
        {HEADING[type]}
      </Heading>
      <Text style={paragraphStyle}>
        Привет, {recepientName} {recepientSurname}!
      </Text>

      <Section style={{ backgroundColor: colors.softAccent, borderRadius: '14px', padding: '16px', marginBottom: '22px' }}>
        <Row>
          <Column style={{ width: '52px' }}>
            {profilePhoto ? (
              <Img
                src={profilePhoto}
                width="40"
                height="40"
                alt="Аватар пользователя"
                style={{ borderRadius: '50%', display: 'block' }}
              />
            ) : (
              <Section
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: '50%',
                  color: colors.surface,
                  fontFamily,
                  fontSize: '18px',
                  height: '40px',
                  lineHeight: '40px',
                  textAlign: 'center',
                  width: '40px',
                }}
              >
                {(name || 'R').slice(0, 1).toUpperCase()}
              </Section>
            )}
          </Column>
          <Column>
            <Text style={{ color: colors.text, fontFamily, fontSize: '16px', lineHeight: '22px', margin: 0 }}>
              <strong>
                {name} {surname}
              </strong>
              <br />
              <span style={{ color: colors.muted }}>{PARAGRAPH[type]}</span>
            </Text>
          </Column>
        </Row>
      </Section>

      {comment && (
        <Text
          style={{
            borderLeft: `3px solid ${colors.accent}`,
            color: colors.text,
            fontFamily,
            fontSize: '16px',
            fontStyle: 'italic',
            lineHeight: '25px',
            margin: '0 0 22px',
            padding: '2px 0 2px 16px',
          }}
        >
          «{comment}»
        </Text>
      )}

      {mapPhotoUrl && (
        <Section style={{ paddingBottom: '22px' }}>
          <Img
            src={mapPhotoUrl}
            width="100%"
            alt="Изображение активности"
            style={{ borderRadius: '14px', display: 'block', maxWidth: '100%' }}
          />
        </Section>
      )}

      <Text style={{ color: colors.muted, fontFamily, fontSize: '14px', lineHeight: '21px', margin: 0 }}>
        Откройте приложение Runich, чтобы посмотреть подробности.
      </Text>
      <Link href="https://runich.expo.app" style={{ color: colors.accentDark, fontFamily, fontSize: '14px' }}>
        Открыть Runich
      </Link>
    </EmailLayout>
  );
}
