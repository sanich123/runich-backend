import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { CommentService } from './comment.service';
import { ParamsId } from 'src/app/params-validation';
import { CommentDTO, CommentLikeDto } from './comment.dto';
import { ApiOperation, ApiResponse, ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';

const { comment, id, like } = PATHS;
const { OK, BAD_REQUEST, CREATED, NO_CONTENT } = HttpStatus;

@ApiTags(comment)
@Controller(comment)
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get(`${id}?`)
  @ApiOperation({ summary: 'Get comments by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getCommentsByActivityId(@Param() { id }: ParamsId, @Query('take') take: string) {
    return await this.commentService.getCommentsbyActivityId(id, take);
  }

  @Get(`${id}/count`)
  @ApiOperation({ summary: 'Get comments length by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getCommentsLengthByActivityId(@Param() { id }: ParamsId) {
    return await this.commentService.getCommentsLengthbyActivityId(id);
  }

  @Post(id)
  @ApiOperation({ summary: 'Post comment by activity id' })
  @ApiParam({ name: 'activityId', required: true, description: 'Activity identifer' })
  @ApiBody({ type: CommentDTO, required: true })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(CREATED)
  async postCommentWithActivityId(@Body() commentDto: CommentDTO, @Param() { id }: ParamsId) {
    return await this.commentService.createCommentByActivityId(commentDto, id);
  }

  @Delete(id)
  @ApiOperation({ summary: 'Delete comment by comment id' })
  @ApiParam({ name: 'commentId', required: true, description: 'Comment identifer' })
  @ApiResponse({ status: NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(NO_CONTENT)
  async deleteCommentWithCommentId(@Param() { id }: ParamsId) {
    return await this.commentService.deleteCommentByCommentId(id);
  }

  @Patch(id)
  @ApiOperation({ summary: 'Update comment by comment id' })
  @ApiParam({ name: 'commentId', required: true, description: 'Comment identifer' })
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async updateCommentById(@Body() { comment }: { comment: string }, @Param() { id }) {
    return await this.commentService.updateCommentByCommentId(comment, id);
  }

  @Post(`${id}/${like}`)
  @ApiOperation({ summary: 'Post like to comment by comment id' })
  @ApiParam({ name: 'commentId', required: true, description: 'Activity identifer' })
  @ApiBody({ type: CommentLikeDto, required: true })
  @ApiResponse({ status: CREATED, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(CREATED)
  async postCommentLikeWithCommentId(@Body() commentLikeDto: CommentLikeDto) {
    return await this.commentService.createCommentLikeByCommentId(commentLikeDto);
  }

  @Delete(`${id}/${like}`)
  @ApiOperation({ summary: 'Delete like to comment by like id' })
  @ApiParam({ name: 'likeId', required: true, description: 'CommentLike identifer' })
  @ApiResponse({ status: NO_CONTENT, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(NO_CONTENT)
  async deleteCommentLikeWithLikeId(@Param() { id }: ParamsId) {
    return await this.commentService.deleteCommentLikeByLikeId(id);
  }

  @Get(`${id}/${like}`)
  @ApiParam({ name: 'commentId', required: true, description: 'Activity identifer' })
  @ApiOperation({ summary: 'Get likes to comment by comment id' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getCommentLikesLengthByCommentId(@Param() { id }: ParamsId) {
    return await this.commentService.getCommentLikesLengthByCommentId(id);
  }
}
