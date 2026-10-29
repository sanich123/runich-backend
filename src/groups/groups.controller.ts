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
import { CreateGroupDto, GroupMembersQueryDto, ListGroupsQueryDto, UpdateGroupMemberDto } from './groups.dto';
import { GroupsService } from './groups.service';

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
}
