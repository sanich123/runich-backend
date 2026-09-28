import type { CSSProperties } from 'react';

import { RUNICH_LOGO_CID } from '../../common/email/constants';

export const emailColors = {
  accent: '#F15A3E',
  accentDark: '#C63A32',
  background: '#F2F2F0',
  ink: '#242424',
  surface: '#FFFFFF',
  surfaceSoft: '#FAFAF7',
  text: '#262626',
  muted: '#73736C',
  border: '#E6E6E0',
  softAccent: '#FFF2E3',
} as const;

export const emailFontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
export const emailLogoUrl = `cid:${RUNICH_LOGO_CID}`;

export const emailLayoutStyles = {
  body: {
    backgroundColor: emailColors.background,
    color: emailColors.text,
    fontFamily: emailFontFamily,
    margin: 0,
    padding: '28px 14px',
  } satisfies CSSProperties,
  container: {
    margin: '0 auto',
    maxWidth: '720px',
    width: '100%',
  } satisfies CSSProperties,
  header: {
    backgroundColor: emailColors.ink,
    borderRadius: '22px 22px 0 0',
    padding: '24px',
    textAlign: 'center',
  } satisfies CSSProperties,
  logo: {
    borderRadius: '16px',
    display: 'block',
    margin: '0 auto',
  } satisfies CSSProperties,
  content: {
    backgroundColor: emailColors.surface,
    border: `1px solid ${emailColors.border}`,
    borderRadius: '0 0 22px 22px',
    borderTop: 'none',
    padding: '34px 32px 30px',
  } satisfies CSSProperties,
  footer: {
    padding: '22px 12px 0',
    textAlign: 'center',
  } satisfies CSSProperties,
  footerNotice: {
    color: emailColors.muted,
    fontFamily: emailFontFamily,
    fontSize: '12px',
    lineHeight: '18px',
    margin: '0 0 10px',
  } satisfies CSSProperties,
  footerText: {
    color: emailColors.muted,
    fontFamily: emailFontFamily,
    fontSize: '12px',
    lineHeight: '18px',
    margin: 0,
  } satisfies CSSProperties,
} as const;

const securityNoteBase: CSSProperties = {
  backgroundColor: emailColors.surfaceSoft,
  borderLeft: `3px solid ${emailColors.border}`,
  color: emailColors.muted,
  fontFamily: emailFontFamily,
  fontSize: '13px',
  lineHeight: '20px',
  margin: '24px 0 0',
  padding: '10px 14px',
  textAlign: 'left',
};

export const emailStyles = {
  title: {
    color: emailColors.text,
    fontFamily: emailFontFamily,
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '-0.4px',
    lineHeight: '36px',
    margin: '0 0 14px',
  } satisfies CSSProperties,
  paragraph: {
    color: emailColors.text,
    fontFamily: emailFontFamily,
    fontSize: '16px',
    lineHeight: '25px',
    margin: '0 0 22px',
  } satisfies CSSProperties,
  eyebrow: {
    color: emailColors.accentDark,
    fontFamily: emailFontFamily,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1.6px',
    lineHeight: '16px',
    margin: '0 0 10px',
    textTransform: 'uppercase',
  } satisfies CSSProperties,
  securityNote: securityNoteBase,
  securityNoteFlush: { ...securityNoteBase, marginTop: 0 } satisfies CSSProperties,
  securityNoteCompact: { ...securityNoteBase, marginTop: '18px' } satisfies CSSProperties,
  codeLabel: {
    color: emailColors.muted,
    fontFamily: emailFontFamily,
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0 0 10px',
  } satisfies CSSProperties,
  code: {
    backgroundColor: emailColors.softAccent,
    border: `1px solid ${emailColors.border}`,
    borderRadius: '14px',
    color: emailColors.accentDark,
    fontFamily: emailFontFamily,
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '8px',
    lineHeight: '42px',
    margin: 0,
    padding: '14px 16px',
    textAlign: 'center',
  } satisfies CSSProperties,
  button: {
    backgroundColor: emailColors.accent,
    borderRadius: '14px',
    boxSizing: 'border-box',
    color: emailColors.surface,
    display: 'block',
    fontFamily: emailFontFamily,
    fontSize: '16px',
    fontWeight: 700,
    lineHeight: '22px',
    padding: '14px 22px',
    textDecoration: 'none',
    width: '100%',
  } satisfies CSSProperties,
  buttonSection: {
    margin: '4px 0 26px',
    textAlign: 'center',
  } satisfies CSSProperties,
  notificationButtonSection: {
    margin: '4px 0 0',
    textAlign: 'center',
  } satisfies CSSProperties,
} as const;

export const notificationStyles = {
  actorCard: {
    backgroundColor: emailColors.softAccent,
    borderRadius: '14px',
    marginBottom: '22px',
    padding: '16px',
  } satisfies CSSProperties,
  avatarColumn: {
    width: '52px',
  } satisfies CSSProperties,
  avatar: {
    borderRadius: '50%',
    display: 'block',
  } satisfies CSSProperties,
  avatarFallback: {
    backgroundColor: emailColors.accent,
    borderRadius: '50%',
    color: emailColors.surface,
    fontFamily: emailFontFamily,
    fontSize: '18px',
    height: '40px',
    lineHeight: '40px',
    textAlign: 'center',
    width: '40px',
  } satisfies CSSProperties,
  actorText: {
    color: emailColors.text,
    fontFamily: emailFontFamily,
    fontSize: '16px',
    lineHeight: '22px',
    margin: 0,
  } satisfies CSSProperties,
  actorDescription: {
    color: emailColors.muted,
  } satisfies CSSProperties,
  comment: {
    borderLeft: `3px solid ${emailColors.accent}`,
    color: emailColors.text,
    fontFamily: emailFontFamily,
    fontSize: '16px',
    fontStyle: 'italic',
    lineHeight: '25px',
    margin: '0 0 22px',
    padding: '2px 0 2px 16px',
  } satisfies CSSProperties,
  mapSection: {
    paddingBottom: '22px',
  } satisfies CSSProperties,
  mapImage: {
    borderRadius: '14px',
    display: 'block',
    maxWidth: '100%',
  } satisfies CSSProperties,
} as const;
