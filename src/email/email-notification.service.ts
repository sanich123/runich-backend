import { Injectable } from '@nestjs/common';
import { render } from '@react-email/components';
import { sendEmail } from 'src/common/email/nodemailer';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { NotificationEmail } from './templates';
import { EmailType } from './templates/types';

@Injectable()
export class EmailNotificationService {
  async sendLike(data: LikeEmailDTO) {
    const html = await render(NotificationEmail({ type: EmailType.like, ...data }));
    return sendEmail(data.recepientEmail, 'Лайк к активности', html);
  }

  async sendComment(data: CommentEmailDTO) {
    const html = await render(NotificationEmail({ type: EmailType.comment, ...data }));
    return sendEmail(data.recepientEmail, 'Новый комментарий к вашей активности', html);
  }

  async sendCommentLike(data: CommentLikeEmailDTO) {
    const html = await render(NotificationEmail({ type: EmailType.commentLike, ...data }));
    return sendEmail(data.recepientEmail, 'Лайк к вашему комментарию', html);
  }
}
