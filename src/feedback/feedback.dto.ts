import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class FeedbackAttachmentDto {
  @ApiProperty({ type: String, format: 'uri' })
  @IsUrl({ require_protocol: true })
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ type: String, format: 'uri', nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  thumbnail?: string | null;
}

export class FeedbackDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  feedbackId: string;

  @ApiProperty({ type: String, enum: ['bug', 'feature', 'question'] })
  @IsIn(['bug', 'feature', 'question'])
  kind: 'bug' | 'feature' | 'question';

  @ApiPropertyOptional({ type: String, maxLength: 32 })
  @IsOptional()
  @IsIn(['account', 'workout', 'sync', 'maps', 'groups', 'other'])
  topic?: 'account' | 'workout' | 'sync' | 'maps' | 'groups' | 'other';

  @ApiPropertyOptional({ type: String, format: 'email', maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({ type: String, maxLength: 10000 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(10000)
  text: string;

  @ApiProperty({ type: String, maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  deviceInfo: string;

  @ApiPropertyOptional({ type: [FeedbackAttachmentDto], maxItems: UPLOAD_LIMITS.mediaBatchFiles })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(UPLOAD_LIMITS.mediaBatchFiles)
  @ValidateNested({ each: true })
  @Type(() => FeedbackAttachmentDto)
  attachments?: FeedbackAttachmentDto[];
}
