import { Controller, Get, Post, Body, Param, Delete, Inject, UseGuards, Req, HttpCode } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeResponseDto } from './like.response.dto';
import { LikeDto } from './like.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/auth/auth-request';
import { like, id, activityId, OK, BAD_REQUEST } from './const';

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
  @ApiResponse({ status: OK, type: LikeResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(OK)
  async sendOrDeleteLike(@Body() likeDto: LikeDto, @Req() request?: AuthenticatedRequest) {
    return await this.likeService.addLike(likeDto, request?.user.id);
  }

  @Delete(`${id}/${activityId}`)
  @ApiOkResponse({ type: LikeResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete like' })
  @ApiParam({ name: 'id', description: 'Like identifier' })
  @ApiParam({ name: 'activityId', description: 'Activity identifier' })
  @ApiResponse({ status: OK, type: LikeResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async deleteLike(@Param() { id }: ParamsId, @Req() request?: AuthenticatedRequest) {
    return await this.likeService.deleteLikeById(id, request?.user.id);
  }

  @Get(id)
  @ApiOkResponse({ type: [LikeResponseDto] })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get likes by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: OK, type: [LikeResponseDto], description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getLikesByActivityId(@Param() { id }: ParamsId, @Req() request?: AuthenticatedRequest) {
    return await this.likeService.getLikesByActivityId(id, request?.user.userId ?? request?.user.id);
  }
}
