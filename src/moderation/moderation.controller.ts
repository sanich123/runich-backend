import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ParamsId } from 'src/common/dto/params-validation';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { CONTENT_REPORT_STATUSES } from './moderation.constants';
import {
  ModerationActionDto,
  ModerationAppealDecisionDto,
  SubmitContentReportDto,
  SubmitModerationAppealDto,
} from './moderation.dto';
import { ModerationService } from './moderation.service';
import { ModeratorGuard } from './moderator.guard';

@ApiTags('moderation')
@ApiBearerAuth('bearerAuth')
@Controller('moderation')
export class ModerationController {
  constructor(@Inject(ModerationService) private readonly moderationService: ModerationService) {}

  @Get('access')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check moderator access for the current user' })
  @ApiOkResponse({ description: 'Moderator access status' })
  async getModeratorAccess(@Req() request: AuthenticatedRequest) {
    return await this.moderationService.getModeratorAccess(getAuthenticatedUserId(request));
  }

  @Post('reports')
  @UseGuards(JwtAuthGuard)
  @RateLimit(RATE_LIMITS.contentReport.limit, RATE_LIMITS.contentReport.ttl)
  @ApiOperation({ summary: 'Submit a user content report' })
  @ApiCreatedResponse({ description: 'Report received' })
  async submitReport(@Body() body: SubmitContentReportDto, @Req() request: AuthenticatedRequest) {
    return await this.moderationService.submitReport(getAuthenticatedUserId(request), body);
  }

  @Get('blocks')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List users blocked by the current user' })
  @ApiOkResponse({ description: 'Blocked users' })
  async getBlockedUsers(@Req() request: AuthenticatedRequest) {
    return await this.moderationService.getBlockedUsers(getAuthenticatedUserId(request));
  }

  @Put('blocks/:id')
  @UseGuards(JwtAuthGuard)
  @RateLimit(RATE_LIMITS.userBlock.limit, RATE_LIMITS.userBlock.ttl)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Block a user' })
  @ApiNoContentResponse({ description: 'User blocked' })
  async blockUser(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    await this.moderationService.blockUser(getAuthenticatedUserId(request), id);
  }

  @Delete('blocks/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiNoContentResponse({ description: 'User unblocked' })
  async unblockUser(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    await this.moderationService.unblockUser(getAuthenticatedUserId(request), id);
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @ApiOperation({ summary: 'Get the moderation report queue' })
  @ApiOkResponse({ description: 'Moderation queue' })
  async getReportQueue(@Query('status') status?: string, @Query('take') take?: string) {
    if (status && !CONTENT_REPORT_STATUSES.includes(status as (typeof CONTENT_REPORT_STATUSES)[number])) {
      throw new BadRequestException('Недопустимый статус жалобы');
    }
    return await this.moderationService.getReportQueue(
      status,
      Number(validateOptionalIntegerQuery(take, 'take', { min: 1, max: 100 }) ?? 50),
    );
  }

  @Get('reports/:id')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @ApiOperation({ summary: 'Get report context for a moderator' })
  @ApiOkResponse({ description: 'Report and target context' })
  async getReportDetails(@Param() { id }: ParamsId) {
    return await this.moderationService.getReportDetails(id);
  }

  @Post('reports/:id/actions')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @ApiOperation({ summary: 'Apply and audit a moderation action' })
  @ApiOkResponse({ description: 'Moderation decision recorded' })
  async applyAction(
    @Param() { id }: ParamsId,
    @Body() body: ModerationActionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.moderationService.applyAction(id, getAuthenticatedUserId(request), body);
  }

  @Post('reports/:id/appeals')
  @UseGuards(JwtAuthGuard)
  @RateLimit(RATE_LIMITS.contentReport.limit, RATE_LIMITS.contentReport.ttl)
  @ApiOperation({ summary: 'Appeal a moderation decision affecting the current user' })
  @ApiCreatedResponse({ description: 'Appeal received' })
  async submitAppeal(
    @Param() { id }: ParamsId,
    @Body() body: SubmitModerationAppealDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.moderationService.submitAppeal(id, getAuthenticatedUserId(request), body.reason);
  }

  @Get('appeals')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @ApiOperation({ summary: 'Get pending moderation appeals' })
  @ApiOkResponse({ description: 'Appeal queue' })
  async getAppealQueue(@Query('take') take?: string) {
    return await this.moderationService.getAppealQueue(
      Number(validateOptionalIntegerQuery(take, 'take', { min: 1, max: 100 }) ?? 50),
    );
  }

  @Post('appeals/:id/decision')
  @UseGuards(JwtAuthGuard, ModeratorGuard)
  @ApiOperation({ summary: 'Decide a moderation appeal' })
  @ApiOkResponse({ description: 'Appeal decision recorded' })
  async decideAppeal(
    @Param() { id }: ParamsId,
    @Body() body: ModerationAppealDecisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.moderationService.decideAppeal(id, getAuthenticatedUserId(request), body);
  }
}
