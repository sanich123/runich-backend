import { Heading, Text } from '@react-email/components';

import { EmailButton } from './EmailButton';
import { EmailLayout } from './EmailLayout';
import { EmailSecurityNote } from './EmailSecurityNote';
import { emailStyles } from './const';

export function LoginByEmailLink({ loginUrl }: { loginUrl: string }) {
  return (
    <EmailLayout preview="Вход в Runich по ссылке">
      <Text style={emailStyles.eyebrow}>RUNICH • БЫСТРЫЙ ВХОД</Text>
      <Heading as="h1" style={emailStyles.title}>
        Войдите в Runich одним нажатием
      </Heading>
      <Text style={emailStyles.paragraph}>
        Вы запросили вход в приложение Runich по ссылке. Нажмите кнопку ниже — пароль и код подтверждения не нужны.
      </Text>
      <EmailButton href={loginUrl}>Войти в Runich</EmailButton>
      <EmailSecurityNote variant="flush">
        Ссылка действительна 5 минут и предназначена только для вас. Не пересылайте это письмо другим людям.
      </EmailSecurityNote>
      <EmailSecurityNote>
        Если вы не запрашивали вход, просто проигнорируйте это письмо. Ваш аккаунт в безопасности.
      </EmailSecurityNote>
    </EmailLayout>
  );
}
