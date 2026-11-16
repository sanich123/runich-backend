import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import type { OptionalAuthenticatedRequest } from 'src/auth/request/auth-request';
import { PATHS } from 'src/common/constants';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { FeedbackDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags(PATHS.email)
@Controller(PATHS.email)
export class FeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedbackService: FeedbackService) {}

  @Post('feedback')
  @RateLimit(RATE_LIMITS.feedbackUpload.limit, RATE_LIMITS.feedbackUpload.ttl)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Create a support request with optional S3 media links' })
  @ApiBody({ type: FeedbackDto })
  async create(@Body() body: FeedbackDto, @Req() request: OptionalAuthenticatedRequest) {
    return await this.feedbackService.create(body, request.user?.userId ?? request.user?.id);
  }
}
