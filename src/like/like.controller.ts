import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeDto } from './like.dto';
import { ParamsId } from 'src/app/params-validation';

@Controller('/like')
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  @Get()
  async getAll() {
    return 'There will be like logic';
  }

  @Post()
  async sendOrDeleteLike(@Body() likeDto: LikeDto) {
    return await this.likeService.sendOrDeleteLike(likeDto);
  }

  @Get(':id')
  async getLikesByActivityId(@Param() { id }: ParamsId) {
    return await this.likeService.getLikesByActivityId(id);
  }
}
