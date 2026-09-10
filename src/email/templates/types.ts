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

export const HEADING = {
  [EmailType.comment]: 'Комментарий к активности',
  [EmailType.like]: 'Лайк к активности',
  [EmailType.commentLike]: 'Лайк к комментарию',
  [EmailType.locations]: 'Отслеженные локации',
};

export const PARAGRAPH = {
  [EmailType.comment]: 'так прокомментировал Вашу активность:',
  [EmailType.like]: 'лайкнул Вашу активность:',
  [EmailType.commentLike]: 'Лайкнул комментарий к Вашей активности:',
  [EmailType.locations]: 'Отследили локации пользователя',
};
