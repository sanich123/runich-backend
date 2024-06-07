import { Controller, Get, HttpStatus, HttpCode, Param, Delete, Body, Post } from '@nestjs/common';
import { FriendService } from './friend.service';
import { ParamsId } from 'src/app/params-validation';
import { FriendDto } from './friend.dto';
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';

const { friend, id } = PATHS;
const { OK, BAD_REQUEST, NO_CONTENT, CREATED } = HttpStatus;

@ApiTags(friend)
@Controller(friend)
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @Get(id)
  @ApiOperation({ summary: 'Gets list of friends' })
  @ApiParam({ name: 'userId', required: true, description: 'Whos friends userId' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getFriendsById(@Param() { id }: ParamsId) {
    return await this.friendService.getFriendsById(id);
  }

  @Delete(id)
  @ApiOperation({ summary: 'Delete friend by friendId' })
  @ApiParam({ name: 'friendId', required: true, description: 'Friend identificator' })
  @ApiResponse({ status: NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(NO_CONTENT)
  async deleteFriendById(@Param() { id }: ParamsId) {
    return await this.friendService.deleteFriendById(id);
  }

  @Post(id)
  @ApiOperation({ summary: 'Create friend by friendId' })
  @ApiParam({ name: 'friendId', required: true, description: 'Friend identificator' })
  @ApiBody({ description: 'Create friend body', type: FriendDto })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async createFrienById(@Param() { id }: ParamsId, @Body() friendDto: FriendDto) {
    return await this.friendService.addFriendByFriendId(id, friendDto);
  }

  @Get(`${id}/followers`)
  @ApiOperation({ summary: 'Get followers (profiles, where friendId === userId' })
  @ApiParam({ name: 'userId', required: true, description: 'User identificator' })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getFollowers(@Param() { id }: ParamsId) {
    return await this.friendService.getFollowers(id);
  }
}
