import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const GROUP_NOTIFICATION_PREFERENCES = ['all', 'announcements', 'off'] as const;
const GROUP_FEED_PREFERENCES = ['all', 'admins'] as const;

export class GroupMembersQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'pending'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'pending'])
  status?: 'active' | 'pending' = 'active';

  @ApiPropertyOptional({ description: 'Maximum number of members to return, up to 100' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class UpdateGroupMemberDto {
  @ApiProperty({ enum: ['active', 'rejected', 'removed'] })
  @IsIn(['active', 'rejected', 'removed'])
  status!: 'active' | 'rejected' | 'removed';
}

export class UpdateGroupPreferencesDto {
  @ApiProperty({ enum: GROUP_NOTIFICATION_PREFERENCES })
  @IsIn(GROUP_NOTIFICATION_PREFERENCES)
  notificationPreference!: (typeof GROUP_NOTIFICATION_PREFERENCES)[number];

  @ApiProperty({ enum: GROUP_FEED_PREFERENCES })
  @IsIn(GROUP_FEED_PREFERENCES)
  feedPreference!: (typeof GROUP_FEED_PREFERENCES)[number];
}
