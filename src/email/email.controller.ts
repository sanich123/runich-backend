import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { FeedbackDto } from './email.dto';
import { PATHS } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';

@ApiTags(PATHS.email)
@ApiBearerAuth('bearerAuth')
@Controller(PATHS.email)
export class EmailController {
  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  @Post('feedback')
  @RateLimit(RATE_LIMITS.feedbackUpload.limit, RATE_LIMITS.feedbackUpload.ttl)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send feedback with optional S3 media links' })
  @ApiBody({ type: FeedbackDto })
  async sendFeedback(@Body() body: FeedbackDto, @Req() request: AuthenticatedRequest) {
    return await this.emailService.sendFeedback(body, request.user.id);
  }
}
