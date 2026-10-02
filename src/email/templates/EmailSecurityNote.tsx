import { Text } from '@react-email/components';

import { emailStyles } from './const';
import type { EmailSecurityNoteProps } from './types';

export function EmailSecurityNote({ children, variant = 'default' }: EmailSecurityNoteProps) {
  const style =
    variant === 'flush'
      ? emailStyles.securityNoteFlush
      : variant === 'compact'
        ? emailStyles.securityNoteCompact
        : emailStyles.securityNote;

  return <Text style={style}>{children}</Text>;
}
