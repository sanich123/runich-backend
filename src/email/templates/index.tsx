import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

import { HEADING, NotificationEmailProps, PARAGRAPH } from './types';
import { EMAIL_DELIVERY_NOTICE, RUNICH_LOGO_CID } from '../../common/email/constants';

const colors = {
  accent: '#F15A3E',
  accentDark: '#C63A32',
  background: '#F2F2F0',
  ink: '#242424',
  inkMuted: '#B9B9B1',
  surface: '#FFFFFF',
  surfaceSoft: '#FAFAF7',
  text: '#262626',
  muted: '#73736C',
  border: '#E6E6E0',
  softAccent: '#FFF2E3',
};

const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const logoUrl = `cid:${RUNICH_LOGO_CID}`;

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
          padding: '28px 14px',
        }}>
        <Container style={{ margin: '0 auto', maxWidth: '720px', width: '100%' }}>
          <Section
            style={{
              backgroundColor: colors.ink,
              borderRadius: '22px 22px 0 0',
              padding: '22px 24px',
            }}>
            <Row>
              <Column style={{ verticalAlign: 'middle', width: '56px' }}>
                <Img
                  src={logoUrl}
                  width="48"
                  height="48"
                  alt="Runich"
                  style={{ borderRadius: '14px', display: 'block' }}
                />
              </Column>
              <Column style={{ verticalAlign: 'middle' }}>
                <Text
                  style={{
                    color: colors.surface,
                    fontFamily,
                    fontSize: '20px',
                    fontWeight: 700,
                    letterSpacing: '1.8px',
                    lineHeight: '24px',
                    margin: 0,
                    textTransform: 'uppercase',
                  }}>
                  RUNICH
                </Text>
                <Text
                  style={{
                    color: colors.inkMuted,
                    fontFamily,
                    fontSize: '12px',
                    lineHeight: '18px',
                    margin: '2px 0 0',
                  }}>
                  Активности, которые хочется запомнить
                </Text>
              </Column>
            </Row>
          </Section>

          <Section
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: '0 0 22px 22px',
              borderTop: 'none',
              padding: '34px 32px 30px',
            }}>
            {children}
          </Section>

          <Section style={{ padding: '22px 12px 0', textAlign: 'center' }}>
            <Text style={{ color: colors.muted, fontFamily, fontSize: '12px', lineHeight: '18px', margin: '0 0 10px' }}>
              {EMAIL_DELIVERY_NOTICE}
            </Text>
            <Text style={{ color: colors.muted, fontFamily, fontSize: '12px', lineHeight: '18px', margin: 0 }}>
              Вы получили это письмо, потому что использовали Runich.
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
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '-0.4px',
  lineHeight: '36px',
  margin: '0 0 14px',
};

const paragraphStyle = {
  color: colors.text,
  fontFamily,
  fontSize: '16px',
  lineHeight: '25px',
  margin: '0 0 22px',
};

const eyebrowStyle = {
  color: colors.accentDark,
  fontFamily,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '1.6px',
  lineHeight: '16px',
  margin: '0 0 10px',
  textTransform: 'uppercase' as const,
};

const securityNoteStyle = {
  backgroundColor: colors.surfaceSoft,
  borderLeft: `3px solid ${colors.border}`,
  color: colors.muted,
  fontFamily,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '24px 0 0',
  padding: '10px 14px',
  textAlign: 'left' as const,
};

const codeLabelStyle = {
  color: colors.muted,
  fontFamily,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 10px',
};

const codeStyle = {
  backgroundColor: colors.softAccent,
  border: `1px solid ${colors.border}`,
  borderRadius: '14px',
  color: colors.accentDark,
  fontFamily,
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '8px',
  lineHeight: '42px',
  margin: 0,
  padding: '14px 16px',
  textAlign: 'center' as const,
};

const loginButtonStyle = {
  backgroundColor: colors.accent,
  borderRadius: '14px',
  boxSizing: 'border-box' as const,
  color: colors.surface,
  display: 'block',
  fontFamily,
  fontSize: '16px',
  fontWeight: 700,
  lineHeight: '22px',
  padding: '14px 22px',
  textDecoration: 'none',
  width: '100%',
};

export function ConfirmEmailAddressWithLinkAndCode({ text, loginUrl }: { text: string; loginUrl: string }) {
  return (
    <EmailLayout preview="Подтвердите адрес электронной почты в Runich">
      <Text style={eyebrowStyle}>RUNICH • РЕГИСТРАЦИЯ</Text>
      <Heading as="h1" style={titleStyle}>
        Подтвердите email
      </Heading>
      <Text style={paragraphStyle}>
        Ваш аккаунт почти готов. Сначала попробуйте войти по кнопке ниже. Если ссылка не откроется, используйте код в
        приложении Runich.
      </Text>
      <Section style={{ margin: '4px 0 26px', textAlign: 'center' }}>
        <Link href={loginUrl} style={loginButtonStyle}>
          Войти в Runich
        </Link>
      </Section>
      <Text style={codeLabelStyle}>Или введите код подтверждения:</Text>
      <Text style={codeStyle}>{text}</Text>
      <Text style={{ ...securityNoteStyle, marginTop: 0 }}>
        Кнопка входа действительна 5 минут. После этого войдите обычным способом или запросите новую ссылку.
      </Text>
      <Text style={securityNoteStyle}>Если вы не регистрировались в Runich, просто проигнорируйте это письмо.</Text>
    </EmailLayout>
  );
}

export function PasswordChangeCode({ text }: { text: string }) {
  return (
    <EmailLayout preview="Код для смены пароля в Runich">
      <Text style={eyebrowStyle}>RUNICH • БЕЗОПАСНОСТЬ</Text>
      <Heading as="h1" style={titleStyle}>
        Код для смены пароля
      </Heading>
      <Text style={paragraphStyle}>
        Мы получили запрос на смену пароля для вашего аккаунта. Введите код ниже в приложении Runich, чтобы подтвердить
        запрос и установить новый пароль.
      </Text>
      <Text style={codeLabelStyle}>Код для смены пароля:</Text>
      <Text style={codeStyle}>{text}</Text>
      <Text style={{ ...securityNoteStyle, marginTop: '18px' }}>
        Никому не сообщайте этот код. Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.
      </Text>
    </EmailLayout>
  );
}

export function LoginByEmailLink({ loginUrl }: { loginUrl: string }) {
  return (
    <EmailLayout preview="Вход в Runich по ссылке">
      <Text style={eyebrowStyle}>RUNICH • БЫСТРЫЙ ВХОД</Text>
      <Heading as="h1" style={titleStyle}>
        Войдите в Runich одним нажатием
      </Heading>
      <Text style={paragraphStyle}>
        Вы запросили вход в приложение Runich по ссылке. Нажмите кнопку ниже — пароль и код подтверждения не нужны.
      </Text>
      <Section style={{ margin: '4px 0 26px', textAlign: 'center' }}>
        <Link href={loginUrl} style={loginButtonStyle}>
          Войти в Runich
        </Link>
      </Section>
      <Text style={{ ...securityNoteStyle, marginTop: 0 }}>
        Ссылка действительна 5 минут и предназначена только для вас. Не пересылайте это письмо другим людям.
      </Text>
      <Text style={{ ...securityNoteStyle, marginTop: '24px' }}>
        Если вы не запрашивали вход, просто проигнорируйте это письмо. Ваш аккаунт в безопасности.
      </Text>
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
  activityUrl,
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

      <Section
        style={{ backgroundColor: colors.softAccent, borderRadius: '14px', padding: '16px', marginBottom: '22px' }}>
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
                }}>
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
          }}>
          «{comment}»
        </Text>
      )}

      {mapPhotoUrl && (
        <Section style={{ paddingBottom: '22px' }}>
          {activityUrl ? (
            <Link href={activityUrl}>
              <Img
                src={mapPhotoUrl}
                width="100%"
                alt="Открыть активность в Runich"
                style={{ borderRadius: '14px', display: 'block', maxWidth: '100%' }}
              />
            </Link>
          ) : (
            <Img
              src={mapPhotoUrl}
              width="100%"
              alt="Изображение активности"
              style={{ borderRadius: '14px', display: 'block', maxWidth: '100%' }}
            />
          )}
        </Section>
      )}

      <Section style={{ margin: '4px 0 0', textAlign: 'center' }}>
        <Link href={activityUrl ?? 'https://runich.netlify.app'} style={loginButtonStyle}>
          {activityUrl ? 'Открыть активность в Runich' : 'Открыть приложение Runich'}
        </Link>
      </Section>
    </EmailLayout>
  );
}
