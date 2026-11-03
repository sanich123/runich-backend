import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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

  @ApiProperty({ enum: GROUP_SPORTS, isArray: true, minItems: 1, maxItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
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

export class UpdateGroupDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: GROUP_SPORTS, isArray: true, minItems: 1, maxItems: 1 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsIn(GROUP_SPORTS, { each: true })
  sports?: (typeof GROUP_SPORTS)[number][];

  @ApiPropertyOptional({ enum: GROUP_CATEGORIES, isArray: true, maxItems: 3 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(GROUP_CATEGORIES, { each: true })
  categoryTags?: (typeof GROUP_CATEGORIES)[number][];

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  photoAssetId?: string | null;

  @ApiPropertyOptional({ enum: GROUP_PRIVACY_VALUES })
  @IsOptional()
  @IsIn(GROUP_PRIVACY_VALUES)
  privacy?: (typeof GROUP_PRIVACY_VALUES)[number];

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationName?: string | null;
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
