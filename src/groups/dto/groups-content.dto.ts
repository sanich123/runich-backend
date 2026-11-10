import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GROUP_SPORTS } from './groups.dto';

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

  @ApiPropertyOptional({ description: 'Maximum number of events to return, up to 100' })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
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

  @ApiPropertyOptional({ enum: GROUP_SPORTS })
  @IsOptional()
  @IsIn(GROUP_SPORTS)
  sport?: (typeof GROUP_SPORTS)[number];

  @ApiPropertyOptional({ type: Number, minimum: 0.1, maximum: 500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(500)
  distanceKm?: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsDateString()
  startsAt!: string;
}
