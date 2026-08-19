import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import {
  CommentLikeResponseDto,
  CommentLikeSummaryResponseDto,
  CommentResponseDto,
  CommentsResponseDto,
} from './comment.response.dto';
import { ParamsId } from 'src/common/dto/params-validation';
import { CommentDTO, CommentLikeDto, CommentUpdateDto } from './comment.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PATHS } from 'src/common/constants';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import type { AuthenticatedRequest } from 'src/auth/auth-request';

const { comment, id, like } = PATHS;
const { OK, BAD_REQUEST, CREATED, NO_CONTENT } = HttpStatus;

@ApiTags(comment)
@ApiBearerAuth('bearerAuth')
@Controller(comment)
export class CommentController {
  constructor(@Inject(CommentService) private readonly commentService: CommentService) {}

  @Get(id)
  @ApiOkResponse({ type: CommentsResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get comments by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiQuery({ name: 'take', required: false, description: 'Count of comments' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getCommentsByActivityId(
    @Param() { id }: ParamsId,
    @Query('take') take?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return await this.commentService.getCommentsbyActivityId(
      id,
      validateOptionalIntegerQuery(take, 'take', { min: 1 }),
      request?.user.userId ?? request?.user.id,
    );
  }

  @Get(`${id}/count`)
  @ApiOkResponse({ type: Number })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get comments length by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getCommentsLengthByActivityId(@Param() { id }: ParamsId, @Req() request?: AuthenticatedRequest) {
    return await this.commentService.getCommentsLengthbyActivityId(id, request?.user.userId ?? request?.user.id);
  }

  @Post(id)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Post comment by activity id' })
  @ApiParam({ name: 'id', description: 'Activity identifier' })
  @ApiBody({ type: CommentDTO, required: true })
  @ApiResponse({ status: CREATED, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(CREATED)
  async postCommentWithActivityId(
    @Body() commentDto: CommentDTO,
    @Param() { id }: ParamsId,
    @Req() request?: AuthenticatedRequest,
  ) {
    return await this.commentService.createCommentByActivityId(
      commentDto,
      id,
      request?.user.userId ?? request?.user.id,
    );
  }

  @Delete(id)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete comment by comment id' })
  @ApiParam({ name: 'id', description: 'Comment identifier' })
  @ApiResponse({ status: NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(NO_CONTENT)
  async deleteCommentWithCommentId(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    return await this.commentService.deleteCommentByCommentId(id, request.user.id);
  }

  @Patch(id)
  @ApiOkResponse({ type: CommentResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update comment by comment id' })
  @ApiParam({ name: 'id', description: 'Comment identifier' })
  @ApiBody({ type: CommentUpdateDto, required: true })
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: CREATED, type: CommentResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async updateCommentById(
    @Body() commentDto: CommentUpdateDto,
    @Param() { id }: ParamsId,
    @Req() request: AuthenticatedRequest,
  ) {
    return await this.commentService.updateCommentByCommentId(commentDto.comment, id, request.user.id);
  }

  @Post(`${id}/${like}`)
  @ApiOkResponse({ type: CommentLikeResponseDto })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Post like to comment by comment id' })
  @ApiParam({ name: 'id', description: 'Comment identifier' })
  @ApiBody({ type: CommentLikeDto, required: true })
  @ApiResponse({ status: OK, type: CommentLikeResponseDto, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(OK)
  async postCommentLikeWithCommentId(@Body() commentLikeDto: CommentLikeDto, @Req() request?: AuthenticatedRequest) {
    return await this.commentService.createCommentLikeByCommentId(
      commentLikeDto,
      request?.user.userId ?? request?.user.id,
    );
  }

  @Delete(`${id}/${like}`)
  @ApiOkResponse({ schema: { type: 'null' }, description: 'No response body' })
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete like to comment by like id' })
  @ApiParam({ name: 'id', description: 'Comment like identifier' })
  @ApiResponse({ status: NO_CONTENT, schema: { type: 'null' }, description: 'No response body' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  @HttpCode(NO_CONTENT)
  async deleteCommentLikeWithLikeId(@Param() { id }: ParamsId, @Req() request: AuthenticatedRequest) {
    return await this.commentService.deleteCommentLikeByLikeId(id, request.user.id);
  }

  @Get(`${id}/${like}`)
  @ApiOkResponse({ type: [CommentLikeSummaryResponseDto] })
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id', description: 'Comment identifier' })
  @ApiOperation({ summary: 'Get likes to comment by comment id' })
  @ApiResponse({ status: OK, description: 'Success' })
  @ApiResponse({ status: BAD_REQUEST, description: 'Bad Request' })
  async getCommentLikesLengthByCommentId(@Param() { id }: ParamsId, @Req() request?: AuthenticatedRequest) {
    return await this.commentService.getCommentLikesLengthByCommentId(id, request?.user.userId ?? request?.user.id);
  }
}
