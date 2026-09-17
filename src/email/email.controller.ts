import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { CommentEmailDTO, CommentLikeEmailDTO, FeedbackDto, LikeEmailDTO } from './email.dto';
import { PATHS } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
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
  @ApiOperation({ summary: 'Send feedback with optional S3 media links' })
  @ApiBody({ type: FeedbackDto })
  async sendFeedback(@Body() body: FeedbackDto, @Req() request: AuthenticatedRequest) {
    return await this.emailService.sendFeedback(body, request.user.id);
  }
}
