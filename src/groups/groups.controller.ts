import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { getAuthenticatedUserId, type AuthenticatedRequest } from 'src/auth/request/auth-request';
import {
  CreateGroupDto,
  CreateGroupEventDto,
  CreateGroupPostDto,
  ListGroupEventsQueryDto,
  GroupMembersQueryDto,
  ListGroupsQueryDto,
  UpdateGroupMemberDto,
  UpdateGroupPreferencesDto,
} from './groups.dto';
import { GroupsService } from './groups.service';
import { validateOptionalIntegerQuery, validateOptionalIanaTimeZoneQuery } from 'src/common/utils/query-validation';

@ApiTags('groups')
@ApiBearerAuth('bearerAuth')
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List discoverable or joined groups' })
  getGroups(@Req() request: AuthenticatedRequest, @Query() query: ListGroupsQueryDto) {
    return this.groupsService.getGroups(getAuthenticatedUserId(request), query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a group' })
  createGroup(@Req() request: AuthenticatedRequest, @Body() body: CreateGroupDto) {
    return this.groupsService.createGroup(getAuthenticatedUserId(request), body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group details and current membership' })
  getGroup(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.groupsService.getGroup(getAuthenticatedUserId(request), id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join an open group or request access to a closed group' })
  joinGroup(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.groupsService.joinGroup(getAuthenticatedUserId(request), id);
  }

  @Delete(':id/membership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a group or cancel a join request' })
  async leaveGroup(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await this.groupsService.leaveGroup(getAuthenticatedUserId(request), id);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List group members or pending join requests' })
  getMembers(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query() query: GroupMembersQueryDto) {
    return this.groupsService.getMembers(getAuthenticatedUserId(request), id, query.status ?? 'active');
  }

  @Patch(':id/members/:userId')
  @ApiOperation({ summary: 'Approve, decline, or remove a group member' })
  updateMember(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: UpdateGroupMemberDto,
  ) {
    return this.groupsService.updateMember(getAuthenticatedUserId(request), id, userId, body.status);
  }

  @Get(':id/statistics/month')
  @ApiOperation({ summary: 'Get the monthly public distance leaderboard for active group members' })
  getMonthlyLeaderboard(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('timeZone') timeZone?: string,
  ) {
    const validatedYear = validateOptionalIntegerQuery(year, 'year', { min: 2000, max: 9999 });
    const validatedMonth = validateOptionalIntegerQuery(month, 'month', { max: 11 });
    const validatedTimeZone = validateOptionalIanaTimeZoneQuery(timeZone, 'timeZone');
    return this.groupsService.getMonthlyLeaderboard(
      getAuthenticatedUserId(request),
      id,
      validatedYear === undefined ? undefined : Number(validatedYear),
      validatedMonth === undefined ? undefined : Number(validatedMonth),
      validatedTimeZone,
    );
  }

  @Patch(':id/preferences')
  @ApiOperation({ summary: 'Update the current member group notification and feed preferences' })
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateGroupPreferencesDto,
  ) {
    return this.groupsService.updatePreferences(getAuthenticatedUserId(request), id, body);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'List recent group posts visible to the current user' })
  getPosts(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.groupsService.getPosts(getAuthenticatedUserId(request), id);
  }

  @Post(':id/posts')
  @ApiOperation({ summary: 'Publish a post to a group' })
  createPost(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: CreateGroupPostDto) {
    return this.groupsService.createPost(getAuthenticatedUserId(request), id, body);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'List upcoming or past group events' })
  getEvents(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query() query: ListGroupEventsQueryDto) {
    return this.groupsService.getEvents(getAuthenticatedUserId(request), id, query.period ?? 'upcoming');
  }

  @Post(':id/events')
  @ApiOperation({ summary: 'Create an event for a group' })
  createEvent(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: CreateGroupEventDto) {
    return this.groupsService.createEvent(getAuthenticatedUserId(request), id, body);
  }
}
