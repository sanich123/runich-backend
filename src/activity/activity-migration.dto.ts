import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export const ACTIVITY_MIGRATION_STATUS = {
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;

export type ActivityMigrationStatus = (typeof ACTIVITY_MIGRATION_STATUS)[keyof typeof ACTIVITY_MIGRATION_STATUS];

export class ActivityMigrationJobParams {
  @IsUUID()
  @IsNotEmpty()
  jobId: string;
}

export class ActivityMigrationJobResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  jobId: string;

  @ApiProperty({ enum: Object.values(ACTIVITY_MIGRATION_STATUS) })
  status: ActivityMigrationStatus;

  @ApiProperty({ type: Number })
  totalActivities: number;

  @ApiProperty({ type: Number })
  processedActivities: number;

  @ApiProperty({ type: Number })
  importedActivities: number;

  @ApiProperty({ type: Number })
  skippedActivities: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  errorMessage: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finishedAt: Date | null;
}
