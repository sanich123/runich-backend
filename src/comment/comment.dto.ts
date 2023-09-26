import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CommentDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Text of comment', nullable: false, required: true })
  comment: string;
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true })
  authorId: string;
}

export class CommentLikeDto {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true })
  commentId: string;
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true })
  authorId: string;
}
