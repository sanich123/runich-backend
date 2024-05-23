import { Controller, Get, Post, Body, Param, HttpStatus, Delete } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeDto } from './like.dto';
import { ParamsId } from 'src/app/params-validation';
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';

const { like, id } = PATHS;
const { CREATED, BAD_REQUEST, NO_CONTENT } = HttpStatus;

@ApiTags(like)
@Controller(like)
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  @Post()
  @ApiOperation({ summary: 'Create or delete like' })
  @ApiBody({ type: LikeDto })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async sendOrDeleteLike(@Body() likeDto: LikeDto) {
    return await this.likeService.addLike(likeDto);
  }

  @Delete(id)
  @ApiOperation({ summary: 'Delete like' })
  @ApiParam({ name: 'likeId', required: true, description: 'Like identifer' })
  @ApiResponse({ status: NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async deleteLike(@Param() { id }: ParamsId) {
    return await this.likeService.deleteLikeById(id);
  }

  @Get(id)
  @ApiOperation({ summary: 'Get likes by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getLikesByActivityId(@Param() { id }: ParamsId) {
    return await this.likeService.getLikesByActivityId(id);
  }
}
