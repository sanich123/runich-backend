import { Link, Section } from '@react-email/components';

import { emailStyles } from './const';
import type { EmailButtonProps } from './types';

export function EmailButton({ href, children, variant = 'default' }: EmailButtonProps) {
  const sectionStyle = variant === 'notification' ? emailStyles.notificationButtonSection : emailStyles.buttonSection;

  return (
    <Section style={sectionStyle}>
      <Link href={href} style={emailStyles.button}>
        {children}
      </Link>
    </Section>
  );
}
