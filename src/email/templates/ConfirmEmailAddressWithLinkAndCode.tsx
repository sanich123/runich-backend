import { Heading, Text } from '@react-email/components';

import { EmailButton } from './EmailButton';
import { EmailCode } from './EmailCode';
import { EmailLayout } from './EmailLayout';
import { EmailSecurityNote } from './EmailSecurityNote';
import { emailStyles } from './const';

export function ConfirmEmailAddressWithLinkAndCode({ text, loginUrl }: { text: string; loginUrl: string }) {
  return (
    <EmailLayout preview="Подтвердите адрес электронной почты в Runich">
      <Text style={emailStyles.eyebrow}>RUNICH • РЕГИСТРАЦИЯ</Text>
      <Heading as="h1" style={emailStyles.title}>
        Подтвердите email
      </Heading>
      <Text style={emailStyles.paragraph}>
        Ваш аккаунт почти готов. Сначала попробуйте войти по кнопке ниже. Если ссылка не откроется, используйте код в
        приложении Runich.
      </Text>
      <EmailButton href={loginUrl}>Войти в Runich</EmailButton>
      <EmailCode label="Или введите код подтверждения:" text={text} />
      <EmailSecurityNote variant="flush">
        Кнопка входа действительна 5 минут. После этого войдите обычным способом или запросите новую ссылку.
      </EmailSecurityNote>
      <EmailSecurityNote>Если вы не регистрировались в Runich, просто проигнорируйте это письмо.</EmailSecurityNote>
    </EmailLayout>
  );
}
