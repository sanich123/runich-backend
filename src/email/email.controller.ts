import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { PATHS } from 'src/utils/const';

@ApiTags(PATHS.email)
@Controller(PATHS.email)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post(PATHS.like)
  async sendLikeEmailNotification(@Body() emailDto: LikeEmailDTO) {
    try {
      return await this.emailService.sendLikeEmailNotification(emailDto);
    } catch (error) {
      console.log(error);
    }
  }

  @Post(PATHS.comment)
  async sendCommentEmailNotification(@Body() commentDto: CommentEmailDTO) {
    return await this.emailService.sendCommentEmailNotification(commentDto);
  }

  @Post(PATHS.commentLike)
  async sendCommentLikeEmailNotification(@Body() commentLikeDto: CommentLikeEmailDTO) {
    return await this.emailService.sendCommentLikeEmailNotification(commentLikeDto);
  }
}
