import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CommentDTO {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Text of comment', nullable: false, required: true, type: String })
  comment: string;
}

export class CommentLikeDto {
  @IsNotEmpty()
  @IsUUID()
  @ApiProperty({ title: 'Author identifer', nullable: false, required: true, type: String })
  commentId: string;
}

export class CommentUpdateDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ title: 'Updated text of comment', nullable: false, required: true, type: String })
  comment: string;
}

class CommentUserEmailResponseDto {
  @ApiProperty({ type: String, format: 'email' })
  email: string;
}

class CommentProfileResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  surname: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  name: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhoto: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhotoBlurhash: string | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  emailNotifications: boolean | null;

  @ApiPropertyOptional({ type: CommentUserEmailResponseDto, nullable: true })
  user?: CommentUserEmailResponseDto | null;
}

export class CommentLikeSummaryResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;
}

export class CommentResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  date: Date | string;

  @ApiProperty({ type: String })
  comment: string;

  @ApiProperty({ type: String, format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  activityId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  profileId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ type: CommentProfileResponseDto, nullable: true })
  profile?: CommentProfileResponseDto | null;

  @ApiProperty({ type: [CommentLikeSummaryResponseDto] })
  commentLike: CommentLikeSummaryResponseDto[];
}

export class CommentsResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  comments: CommentResponseDto[];

  @ApiProperty({ type: Boolean })
  hasMore: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class CommentLikeResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  date: Date | string;

  @ApiProperty({ type: String, format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  commentId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  profileId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;
}
