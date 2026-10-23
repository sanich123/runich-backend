import type { ReactNode } from 'react';

export interface EmailLayoutProps {
  preview: string;
  locale?: 'russian' | 'english';
  children: ReactNode;
}

export interface EmailButtonProps {
  href: string;
  children: ReactNode;
  variant?: 'default' | 'notification';
}

export interface EmailCodeProps {
  label: string;
  text: string;
}

export interface EmailSecurityNoteProps {
  children: ReactNode;
  variant?: 'default' | 'flush' | 'compact';
}

export interface NotificationActorProps {
  name?: string;
  surname?: string;
  profilePhoto?: string;
  description: string;
}

export interface NotificationEmailProps {
  name?: string;
  surname?: string;
  recepientName?: string;
  recepientSurname?: string;
  profilePhoto?: string;
  mapPhotoUrl?: string;
  activityUrl?: string;
  comment?: string;
  type: EmailType;
}

export enum EmailType {
  comment = 'comment',
  commentLike = 'commentLike',
  like = 'like',
  locations = 'locations',
}

export const HEADING: Record<EmailType, string> = {
  [EmailType.comment]: 'Комментарий к активности',
  [EmailType.like]: 'Лайк к активности',
  [EmailType.commentLike]: 'Лайк к комментарию',
  [EmailType.locations]: 'Отслеженные локации',
};

export const PARAGRAPH: Record<EmailType, string> = {
  [EmailType.comment]: 'так прокомментировал Вашу активность:',
  [EmailType.like]: 'лайкнул Вашу активность:',
  [EmailType.commentLike]: 'Лайкнул комментарий к Вашей активности:',
  [EmailType.locations]: 'Отследили локации пользователя',
};
