import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const GROUP_SPORTS = ['run', 'walk', 'hike', 'bike'] as const;
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

  @ApiProperty({ enum: GROUP_SPORTS, isArray: true, minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(GROUP_SPORTS, { each: true })
  sports!: (typeof GROUP_SPORTS)[number][];

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
