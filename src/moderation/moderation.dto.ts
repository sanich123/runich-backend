import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CONTENT_REPORT_REASONS, CONTENT_REPORT_TARGET_TYPES, MODERATION_ACTION_TYPES } from './moderation.constants';

export class SubmitContentReportDto {
  @ApiProperty({ enum: CONTENT_REPORT_TARGET_TYPES })
  @IsIn(CONTENT_REPORT_TARGET_TYPES)
  targetType: (typeof CONTENT_REPORT_TARGET_TYPES)[number];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ enum: CONTENT_REPORT_REASONS })
  @IsIn(CONTENT_REPORT_REASONS)
  reason: (typeof CONTENT_REPORT_REASONS)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ModerationActionDto {
  @ApiProperty({ enum: MODERATION_ACTION_TYPES })
  @IsIn(MODERATION_ACTION_TYPES)
  action: (typeof MODERATION_ACTION_TYPES)[number];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  suspensionDays?: number;
}

export class SubmitModerationAppealDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}

export class ModerationAppealDecisionDto {
  @ApiProperty({ enum: ['upheld', 'rejected'] })
  @IsIn(['upheld', 'rejected'])
  decision: 'upheld' | 'rejected';

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
