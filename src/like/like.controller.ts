import { Controller, Get, Post, Body, Param, Delete, Inject, UseGuards, Req, HttpCode, Query } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeResponseDto, LikesPageResponseDto } from './like.dto';
import { LikeDto } from './like.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { parseLikeCursor } from './like.pagination';
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
    return await this.likeService.addLike(likeDto, request ? getAuthenticatedUserId(request) : undefined);
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
    return await this.likeService.deleteLikeById(id, request ? getAuthenticatedUserId(request) : undefined);
  }

  @Get(id)
  @ApiOkResponse({ type: LikesPageResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get likes by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiQuery({ name: 'limit', required: false, description: 'Count of likes per page (default 30)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for the next page of older likes' })
  @ApiResponse({ status: OK, type: LikesPageResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getLikesByActivityId(
    @Param() { id }: ParamsId,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return await this.likeService.getLikesByActivityId(
      id,
      request ? getAuthenticatedUserId(request) : undefined,
      validateOptionalIntegerQuery(limit, 'limit', { min: 1, max: 50 }),
      parseLikeCursor(cursor),
    );
  }

  @Get(`${id}/count`)
  @ApiOkResponse({ type: Number })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get likes length by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getLikesLengthByActivityId(@Param() { id }: ParamsId, @Req() request?: AuthenticatedRequest) {
    return await this.likeService.getLikesLengthByActivityId(id, request ? getAuthenticatedUserId(request) : undefined);
  }
}
