import { Body, Controller, Inject, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email.dto';
import { PATHS } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/auth-request';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';

@ApiTags(PATHS.email)
@ApiBearerAuth('bearerAuth')
@Controller(PATHS.email)
export class EmailController {
  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  @Post(PATHS.like)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send activity-like notification' })
  @ApiBody({ type: LikeEmailDTO })
  @ApiResponse({ status: 201, schema: { type: 'null' }, description: 'No response body' })
  async sendLikeEmailNotification(@Body() emailDto: LikeEmailDTO) {
    return await this.emailService.sendLikeEmailNotification(emailDto);
  }

  @Post(PATHS.comment)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send comment notification' })
  @ApiBody({ type: CommentEmailDTO })
  @ApiResponse({ status: 201, schema: { type: 'null' }, description: 'No response body' })
  async sendCommentEmailNotification(@Body() commentDto: CommentEmailDTO) {
    return await this.emailService.sendCommentEmailNotification(commentDto);
  }

  @Post(PATHS.commentLike)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send comment-like notification' })
  @ApiBody({ type: CommentLikeEmailDTO })
  @ApiResponse({ status: 201, schema: { type: 'null' }, description: 'No response body' })
  async sendCommentLikeEmailNotification(@Body() commentLikeDto: CommentLikeEmailDTO) {
    return await this.emailService.sendCommentLikeEmailNotification(commentLikeDto);
  }

  @Post('feedback')
  @RateLimit(RATE_LIMITS.feedbackUpload.limit, RATE_LIMITS.feedbackUpload.ttl)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: UPLOAD_LIMITS.feedbackPhotoBytes, files: 1 } }))
  async sendFeedback(
    @Body() body: { kind: string; text: string; deviceInfo: string },
    @Req() request: AuthenticatedRequest,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return await this.emailService.sendFeedback(body.kind, request.user.id, body.text, body.deviceInfo, photo);
  }
}
