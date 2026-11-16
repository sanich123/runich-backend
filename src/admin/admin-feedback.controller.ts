import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ParamsId } from 'src/common/dto/params-validation';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { AdminFeedbackService } from './admin-feedback.service';
import { AdminFeedbackReplyDto, ADMIN_FEEDBACK_STATUSES, UpdateAdminFeedbackStatusDto } from './admin-feedback.dto';
import { FeedbackManagerGuard } from './feedback-manager.guard';

@ApiTags('admin')
@ApiBearerAuth('bearerAuth')
@Controller('admin/feedback')
@UseGuards(JwtAuthGuard, FeedbackManagerGuard)
export class AdminFeedbackController {
  constructor(@Inject(AdminFeedbackService) private readonly feedback: AdminFeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List support requests for authorized administrators' })
  @ApiOkResponse({ description: 'Support request queue' })
  async list(@Query('status') status?: string, @Query('take') take?: string) {
    const statusFilter = ADMIN_FEEDBACK_STATUSES.find((candidate) => candidate === status);
    if (status !== undefined && !statusFilter) {
      throw new BadRequestException('Неизвестный статус обращения');
    }
    const pageSize = Number(validateOptionalIntegerQuery(take, 'take', { min: 1, max: 100 }) ?? 50);
    return await this.feedback.list(statusFilter, pageSize);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a support request and its reply history' })
  @ApiOkResponse({ description: 'Support request details' })
  async getById(@Param() { id }: ParamsId) {
    return await this.feedback.getById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update a support request status' })
  @ApiOkResponse({ description: 'Updated support request' })
  async updateStatus(@Param() { id }: ParamsId, @Body() { status }: UpdateAdminFeedbackStatusDto) {
    return await this.feedback.updateStatus(id, status);
  }

  @Post(':id/reply')
  @RateLimit(RATE_LIMITS.adminFeedbackReply.limit, RATE_LIMITS.adminFeedbackReply.ttl)
  @ApiOperation({ summary: 'Send a branded email reply to a support request' })
  @ApiOkResponse({ description: 'Request with updated reply history' })
  async reply(
    @Param() { id }: ParamsId,
    @Body() { text }: AdminFeedbackReplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.feedback.reply(id, getAuthenticatedUserId(request), text);
  }
}
