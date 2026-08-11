import { Controller, Get, Post, Body, Param, HttpStatus, Delete, Inject, UseGuards } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeResponseDto } from './like.response.dto';
import { LikeDto } from './like.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { PATHS } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

const { like, id, activityId } = PATHS;
const { OK, CREATED, BAD_REQUEST, NO_CONTENT } = HttpStatus;

@ApiTags(like)
@ApiBearerAuth('bearerAuth')
@Controller(like)
export class LikeController {
  constructor(@Inject(LikeService) private readonly likeService: LikeService) {}

  @Post()
  @ApiOkResponse({ type: LikeResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create like' })
  @ApiBody({ type: LikeDto })
  @ApiResponse({ status: CREATED, type: LikeResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async sendOrDeleteLike(@Body() likeDto: LikeDto) {
    return await this.likeService.addLike(likeDto);
  }

  @Delete(`${id}/${activityId}`)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete like' })
  @ApiParam({ name: 'id', description: 'Like identifier' })
  @ApiParam({ name: 'activityId', description: 'Activity identifier' })
  @ApiResponse({ status: NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async deleteLike(@Param() { id }: ParamsId) {
    return await this.likeService.deleteLikeById(id);
  }

  @Get(id)
  @ApiOkResponse({ type: [LikeResponseDto] })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get likes by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: OK, type: [LikeResponseDto], description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getLikesByActivityId(@Param() { id }: ParamsId) {
    return await this.likeService.getLikesByActivityId(id);
  }
}
