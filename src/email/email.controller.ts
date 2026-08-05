import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { PATHS } from 'src/utils/const';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiTags(PATHS.email)
@Controller(PATHS.email)
export class EmailController {
  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  @Post(PATHS.like)
  @UseGuards(JwtAuthGuard)
  async sendLikeEmailNotification(@Body() emailDto: LikeEmailDTO) {
    try {
      return await this.emailService.sendLikeEmailNotification(emailDto);
    } catch (error) {
      console.log(error);
    }
  }

  @Post(PATHS.comment)
  @UseGuards(JwtAuthGuard)
  async sendCommentEmailNotification(@Body() commentDto: CommentEmailDTO) {
    return await this.emailService.sendCommentEmailNotification(commentDto);
  }

  @Post(PATHS.commentLike)
  @UseGuards(JwtAuthGuard)
  async sendCommentLikeEmailNotification(@Body() commentLikeDto: CommentLikeEmailDTO) {
    return await this.emailService.sendCommentLikeEmailNotification(commentLikeDto);
  }
}
