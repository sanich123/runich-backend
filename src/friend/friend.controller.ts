import { Controller, Get, HttpCode, Inject, Param, Delete, Post, UseGuards, Req } from '@nestjs/common';
import { FriendService } from './friend.service';
import { FriendResponseDto } from './friend.response.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import { FriendDto } from './friend.dto';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/auth-request';
import { friend, id, OK, BAD_REQUEST, NO_CONTENT } from './const';

@ApiTags(friend)
@ApiBearerAuth('bearerAuth')
@Controller(friend)
export class FriendController {
  constructor(@Inject(FriendService) private readonly friendService: FriendService) {}

  @Get(id)
  @ApiOkResponse({ type: [FriendResponseDto] })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Gets list of friends' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getUsersYouFollowByUserId(@Param() { id }: ParamsId) {
    return await this.friendService.getUsersYouFollowByUserId(id);
  }

  @Delete(id)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete friend by friendId' })
  @ApiParam({ name: 'id', description: 'Friend relationship identifier' })
  @ApiResponse({ status: NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(NO_CONTENT)
  async deleteFriendById(@Param() { id }: ParamsId, @Req() request?: AuthenticatedRequest) {
    return await this.friendService.deleteFriendById(id, request?.user.id);
  }

  @Post(id)
  @ApiOkResponse({ type: FriendResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create friend by friendId' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiBody({ description: 'Create friend body', type: FriendDto })
  @ApiResponse({ status: OK, type: FriendResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(OK)
  async createFrienById(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    return await this.friendService.addFriendByFriendId(id, request.user.id);
  }

  @Get(`${id}/followers`)
  @ApiOkResponse({ type: [FriendResponseDto] })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get followers (profiles, where friendId === userId' })
  @ApiParam({ name: 'id', description: 'User identifier' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getFollowers(@Param() { id }: ParamsId) {
    return await this.friendService.getFollowers(id);
  }
}
