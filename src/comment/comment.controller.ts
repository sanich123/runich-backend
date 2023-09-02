import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CommentService } from './comment.service';
import { ParamsId } from 'src/app/params-validation';
import { CommentDTO } from './comment.dto';

@Controller('/comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get()
  async getAll() {
    return 'There will be comment logic';
  }
  @Get(':id')
  async getCommentsByActivityId(@Param() { id }: ParamsId) {
    return await this.commentService.getCommentsbyActivityId(id);
  }
  @Post(':id')
  @HttpCode(HttpStatus.CREATED)
  async postCommentWithActivityId(@Body() commentDto: CommentDTO, @Param() { id }: ParamsId) {
    return await this.commentService.createCommentByActivityId(commentDto, id);
  }
}
