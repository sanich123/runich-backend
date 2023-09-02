import { Controller, Get, Post, Body, HttpStatus, HttpCode, Param } from '@nestjs/common';
import { FriendService } from './friend.service';
import { FriendDto } from './friend.dto';
import { ParamsId } from 'src/app/params-validation';

@Controller('/friend')
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @Get()
  async getAllFriend() {
    return 'There will be followers logic';
  }
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addFriend(@Body() friendDto: FriendDto) {
    return await this.friendService.addFriend(friendDto);
  }

  @Get(':id')
  async getFriendsById(@Param() { id }: ParamsId) {
    return await this.friendService.getFriendsById(id);
  }
}
