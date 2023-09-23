import { Controller, Get, HttpStatus, HttpCode, Param, Delete, Body, Post } from '@nestjs/common';
import { FriendService } from './friend.service';
import { ParamsId } from 'src/app/params-validation';
import { FriendDto } from './friend.dto';

@Controller('/friend')
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @Get(':id')
  async getFriendsById(@Param() { id }: ParamsId) {
    return await this.friendService.getFriendsById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFriendById(@Param() { id }: ParamsId, @Body() { userId }: FriendDto) {
    return await this.friendService.deleteFriendById(id, userId);
  }

  @Post(':id')
  async createFrienById(@Param() { id }: ParamsId, @Body() friendDto: FriendDto) {
    return await this.friendService.addFriendByFriendId(id, friendDto);
  }

  @Get(`:id/followers`)
  async getFollowers(@Param() { id }: ParamsId) {
    return await this.friendService.getFollowers(id);
  }
}
