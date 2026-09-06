import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_ACTIVITY_LOCATIONS } from 'src/common/constants';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ActivityPhotoVideoDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsString()
  thumbnail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  blurhash?: string | null;
}

export class ActivityCoordinatesDto {
  @ApiProperty({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  latitude: number;

  @ApiProperty({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  longitude: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  altitude?: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  altitudeAccuracy?: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  heading?: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  speed?: number;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  timestamp?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsBoolean()
  @IsOptional()
  mocked?: boolean;
}

export class ActivityLocationDto {
  @ApiProperty({ type: ActivityCoordinatesDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ActivityCoordinatesDto)
  coords: ActivityCoordinatesDto;
}

export type LocationObject = {
  coords: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
    timestamp?: number;
    mocked?: boolean;
  };
};

export class ActivityKilometreSplitDto {
  @ApiProperty({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  lastKilometerDuration: number;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  lastKilometerSteps?: number;

  @ApiProperty({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  lastKilometerAltitude: number;

  @ApiProperty({ type: ActivityLocationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ActivityLocationDto)
  kilometerPoint: ActivityLocationDto;
}

export type ActivityPhotoVideoObject = {
  url: string;
  thumbnail: string | null;
  blurhash?: string | null;
};

export type ActivityKilometreSplitObject = {
  lastKilometerDuration: number;
  lastKilometerAltitude: number;
  kilometerPoint: LocationObject;
  lastKilometerSteps?: number;
};

export class ActivityDto {
  @ApiProperty({ type: Number, description: 'Duration' })
  @IsNotEmpty()
  @IsInt()
  duration: number;

  @ApiProperty({ type: Number, description: 'Distance' })
  @IsNotEmpty()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  distance: number;

  @ApiProperty({ type: Number, description: 'Speed' })
  @IsNotEmpty()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  speed: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, description: 'Number of steps recorded during the activity' })
  @IsInt()
  @Min(0)
  @IsOptional()
  steps?: number;

  @ApiProperty({ type: String, description: 'Sport value' })
  @IsString()
  @IsNotEmpty()
  sport: string;

  @ApiPropertyOptional({ type: Date, description: 'Date value' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ type: String, description: 'Description value' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: String, description: 'Emotion value' })
  @IsString()
  @IsOptional()
  emotion?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Is activity public or private' })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Photo and video URLs',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        thumbnail: { type: 'string', nullable: true },
        blurhash: { type: 'string' },
      },
      required: ['url', 'thumbnail'],
    },
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityPhotoVideoDto)
  photoVideoUrls?: ActivityPhotoVideoObject[];

  @ApiPropertyOptional({ type: String, description: 'Image of map with points of activity' })
  @IsOptional()
  @IsString()
  mapPhotoUrl?: string;

  @ApiPropertyOptional({ type: String, description: 'Blurhash for the map image' })
  @IsOptional()
  @IsString()
  mapPhotoUrlBlurhash?: string;

  @ApiPropertyOptional({ type: String, description: 'Title value' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Location data',
    maxItems: MAX_ACTIVITY_LOCATIONS,
    items: {
      type: 'object',
      properties: {
        coords: {
          type: 'object',
          properties: {
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            altitude: { type: 'number' },
            accuracy: { type: 'number' },
            altitudeAccuracy: { type: 'number' },
            heading: { type: 'number' },
            speed: { type: 'number' },
            timestamp: { type: 'number' },
            mocked: { type: 'boolean' },
          },
          required: ['latitude', 'longitude'],
        },
      },
      required: ['coords'],
    },
  })
  @IsArray()
  @ArrayMaxSize(MAX_ACTIVITY_LOCATIONS)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ActivityLocationDto)
  locations?: LocationObject[];

  @ApiPropertyOptional({
    type: 'array',
    description: 'Kilometre splits',
    maxItems: MAX_ACTIVITY_LOCATIONS,
    items: {
      type: 'object',
      properties: {
        lastKilometerDuration: { type: 'number' },
        lastKilometerAltitude: { type: 'number' },
        kilometerPoint: { type: 'object' },
      },
      required: ['lastKilometerDuration', 'lastKilometerAltitude', 'kilometerPoint'],
    },
  })
  @IsArray()
  @ArrayMaxSize(MAX_ACTIVITY_LOCATIONS)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ActivityKilometreSplitDto)
  kilometresSplit?: ActivityKilometreSplitObject[];
}
