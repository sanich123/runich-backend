import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { getAuthenticatedUserId, type AuthenticatedRequest } from 'src/auth/request/auth-request';
import { NotificationService } from './notification.service';
import { PushTokenDto } from './push-token.dto';

@ApiTags('notification')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard)
@Controller('/notification')
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the current user notification feed' })
  @ApiOkResponse()
  list(@Req() request: AuthenticatedRequest, @Query('take') take?: string, @Query('cursor') cursor?: string) {
    return this.notifications.list(getAuthenticatedUserId(request), take, cursor);
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the current user unread notification count' })
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.notifications.unreadCount(getAuthenticatedUserId(request));
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(getAuthenticatedUserId(request));
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Mark one current user notification as read' })
  markRead(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.notifications.markRead(getAuthenticatedUserId(request), id);
  }

  @Get('push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get push registration state for this device' })
  pushTokenStatus(@Req() request: AuthenticatedRequest) {
    return this.notifications.getPushTokenStatus(getAuthenticatedUserId(request), request.get('x-device-id') ?? '');
  }

  @Post('push-token')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: PushTokenDto })
  @ApiOperation({ summary: 'Register this device for push notifications' })
  registerPushToken(@Req() request: AuthenticatedRequest, @Body() dto: PushTokenDto) {
    return this.notifications.registerPushToken(getAuthenticatedUserId(request), request.get('x-device-id') ?? '', dto);
  }

  @Delete('push-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable push notifications for this device' })
  unregisterPushToken(@Req() request: AuthenticatedRequest) {
    return this.notifications.unregisterPushToken(getAuthenticatedUserId(request), request.get('x-device-id') ?? '');
  }
}
