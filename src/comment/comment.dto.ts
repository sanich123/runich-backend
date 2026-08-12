import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CommentDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Text of comment', nullable: false, required: true, type: String })
  comment: string;

  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true, type: String })
  authorId: string;
}

export class CommentLikeDto {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true, type: String })
  commentId: string;

  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true, type: String })
  authorId: string;
}

export class CommentUpdateDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Updated text of comment', nullable: false, required: true, type: String })
  comment: string;
}
