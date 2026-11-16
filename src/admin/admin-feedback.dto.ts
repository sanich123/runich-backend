import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export const ADMIN_FEEDBACK_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type AdminFeedbackStatus = (typeof ADMIN_FEEDBACK_STATUSES)[number];

export class UpdateAdminFeedbackStatusDto {
  @ApiProperty({ enum: ADMIN_FEEDBACK_STATUSES })
  @IsIn(ADMIN_FEEDBACK_STATUSES)
  status: AdminFeedbackStatus;
}

export class AdminFeedbackReplyDto {
  @ApiProperty({ type: String, maxLength: 10000 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(10000)
  text: string;
}
