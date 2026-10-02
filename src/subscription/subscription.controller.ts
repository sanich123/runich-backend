import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { CurrentSubscriptionResponseDto } from './subscription.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@ApiBearerAuth('bearerAuth')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(@Inject(SubscriptionService) private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user subscription and feature access' })
  @ApiOkResponse({ type: CurrentSubscriptionResponseDto })
  async getCurrentSubscription(@Req() request: AuthenticatedRequest) {
    return this.subscriptionService.getCurrentSubscription(getAuthenticatedUserId(request));
  }
}
