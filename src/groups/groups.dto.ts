import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const GROUP_SPORTS = ['run', 'walk', 'hike', 'bike'] as const;
export const GROUP_CATEGORIES = [
  'casual',
  'brand',
  'team',
  'corporate',
  'coach',
  'creator',
  'event',
  'local',
  'fundraiser',
  'advice',
  'social',
  'other',
] as const;
export const GROUP_PRIVACY_VALUES = ['open', 'closed'] as const;
export const GROUP_NOTIFICATION_PREFERENCES = ['all', 'announcements', 'off'] as const;
export const GROUP_FEED_PREFERENCES = ['all', 'admins'] as const;

export class CreateGroupDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: GROUP_SPORTS, isArray: true, minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(GROUP_SPORTS, { each: true })
  sports!: (typeof GROUP_SPORTS)[number][];

  @ApiPropertyOptional({ enum: GROUP_CATEGORIES, isArray: true, maxItems: 3 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(GROUP_CATEGORIES, { each: true })
  categoryTags?: (typeof GROUP_CATEGORIES)[number][];

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  photoAssetId?: string;

  @ApiProperty({ enum: GROUP_PRIVACY_VALUES })
  @IsIn(GROUP_PRIVACY_VALUES)
  privacy!: (typeof GROUP_PRIVACY_VALUES)[number];

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationName?: string;
}

export class ListGroupsQueryDto {
  @ApiPropertyOptional({ enum: ['all', 'mine'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'mine'])
  scope?: 'all' | 'mine' = 'all';

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: GROUP_SPORTS })
  @IsOptional()
  @IsIn(GROUP_SPORTS)
  sport?: (typeof GROUP_SPORTS)[number];
}

export class GroupMembersQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'pending'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'pending'])
  status?: 'active' | 'pending' = 'active';
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

export class CreateGroupPostDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  photoAssetId?: string;
}

export class ListGroupEventsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past'], default: 'upcoming' })
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  period?: 'upcoming' | 'past' = 'upcoming';
}

export class CreateGroupEventDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationName?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  startsAt!: string;
}
