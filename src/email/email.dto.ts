import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
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

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  kind: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  deviceInfo: string;

  @ApiPropertyOptional({ type: [FeedbackAttachmentDto], maxItems: UPLOAD_LIMITS.mediaBatchFiles })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(UPLOAD_LIMITS.mediaBatchFiles)
  @ValidateNested({ each: true })
  @Type(() => FeedbackAttachmentDto)
  attachments?: FeedbackAttachmentDto[];
}
