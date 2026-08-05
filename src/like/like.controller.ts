import { Controller, Get, Post, Body, Param, HttpStatus, Delete, Inject, UseGuards } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeDto } from './like.dto';
import { ParamsId } from 'src/app/params-validation';
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

const { like, id, activityId } = PATHS;
const { CREATED, BAD_REQUEST, NO_CONTENT } = HttpStatus;

@ApiTags(like)
@Controller(like)
export class LikeController {
  constructor(@Inject(LikeService) private readonly likeService: LikeService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create like' })
  @ApiBody({ type: LikeDto })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async sendOrDeleteLike(@Body() likeDto: LikeDto) {
    return await this.likeService.addLike(likeDto);
  }

  @Delete(`${id}/${activityId}`)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete like' })
  @ApiParam({ name: 'likeId activityId', required: true, description: 'Like identifer, activityId idetifer' })
  @ApiResponse({ status: NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async deleteLike(@Param() { id }: ParamsId) {
    return await this.likeService.deleteLikeById(id);
  }

  @Get(id)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get likes by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getLikesByActivityId(@Param() { id }: ParamsId) {
    return await this.likeService.getLikesByActivityId(id);
  }
}
