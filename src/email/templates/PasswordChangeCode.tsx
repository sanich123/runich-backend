import { Heading, Text } from '@react-email/components';

import { EmailCode } from './EmailCode';
import { EmailLayout } from './EmailLayout';
import { EmailSecurityNote } from './EmailSecurityNote';
import { emailStyles } from './const';

export function PasswordChangeCode({ text }: { text: string }) {
  return (
    <EmailLayout preview="Код для смены пароля в Runich">
      <Text style={emailStyles.eyebrow}>RUNICH • БЕЗОПАСНОСТЬ</Text>
      <Heading as="h1" style={emailStyles.title}>
        Код для смены пароля
      </Heading>
      <Text style={emailStyles.paragraph}>
        Мы получили запрос на смену пароля для вашего аккаунта. Введите код ниже в приложении Runich, чтобы подтвердить
        запрос и установить новый пароль.
      </Text>
      <EmailCode label="Код для смены пароля:" text={text} />
      <EmailSecurityNote variant="compact">
        Никому не сообщайте этот код. Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.
      </EmailSecurityNote>
    </EmailLayout>
  );
}
