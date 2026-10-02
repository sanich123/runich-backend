import { Text } from '@react-email/components';

import { emailStyles } from './const';
import type { EmailCodeProps } from './types';

export function EmailCode({ label, text }: EmailCodeProps) {
  return (
    <>
      <Text style={emailStyles.codeLabel}>{label}</Text>
      <Text style={emailStyles.code}>{text}</Text>
    </>
  );
}
