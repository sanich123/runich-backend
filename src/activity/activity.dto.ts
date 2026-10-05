import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_ACTIVITY_LOCATIONS } from 'src/common/constants';
import { UPLOAD_LIMITS } from 'src/common/uploads/upload-limits';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsIanaTimeZoneConstraint } from 'src/common/validation/iana-time-zone.validator';
import { ACTIVITY_VISIBILITY, type ActivityVisibility } from './activity-visibility';

class ActivityMediaDto {
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

class ActivityCoordinatesDto {
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

class ActivityLocationDto {
  @ApiProperty({ type: ActivityCoordinatesDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => ActivityCoordinatesDto)
  coords: ActivityCoordinatesDto;

  @ApiPropertyOptional({ type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @IsOptional()
  timestamp?: number;
}

export class ActivityMediaAppendDto {
  @ApiProperty({ type: [ActivityMediaDto], minItems: 1, maxItems: UPLOAD_LIMITS.activityMediaFiles })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(UPLOAD_LIMITS.activityMediaFiles)
  @ValidateNested({ each: true })
  @Type(() => ActivityMediaDto)
  media: ActivityMediaObject[];
}

export type LocationObject = {
  timestamp?: number;
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

class ActivityKilometreSplitDto {
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

export type ActivityMediaObject = {
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

  @ApiPropertyOptional({ type: String, description: 'IANA time zone at activity creation' })
  @IsString()
  @Validate(IsIanaTimeZoneConstraint)
  @IsOptional()
  timeZone?: string;

  @ApiPropertyOptional({ type: String, description: 'Description value' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: String, description: 'Emotion value' })
  @IsString()
  @IsOptional()
  emotion?: string;

  @ApiPropertyOptional({ enum: ACTIVITY_VISIBILITY, description: 'Activity visibility' })
  @IsEnum(ACTIVITY_VISIBILITY)
  @IsOptional()
  visibility?: ActivityVisibility;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Photo and video URLs',
    maxItems: UPLOAD_LIMITS.activityMediaFiles,
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
  @ArrayMaxSize(UPLOAD_LIMITS.activityMediaFiles)
  @ValidateNested({ each: true })
  @Type(() => ActivityMediaDto)
  media?: ActivityMediaObject[];

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
        timestamp: { type: 'number' },
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

export const ACTIVITY_MIGRATION_STATUS = {
  uploading: 'uploading',
  queued: 'queued',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
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

  @ApiProperty({ type: Number, description: 'Bytes received by the API' })
  uploadBytesReceived: number;

  @ApiProperty({ type: Number, description: 'Total archive bytes expected by the API' })
  uploadBytesTotal: number;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '1-based position in the active queue' })
  queuePosition: number | null;

  @ApiProperty({ type: Number, description: 'Number of active migration jobs ahead of this job' })
  queueAhead: number;

  @ApiProperty({ type: Number, description: 'Total number of active and queued migration jobs' })
  queueSize: number;

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

export class ActivityMigrationUploadStartDto {
  @ApiProperty({ type: Number, minimum: 1, description: 'Archive size in bytes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  uploadBytesTotal: number;
}

class ActivityMediaItemDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  id?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  activityId?: string;

  @ApiProperty({ type: String })
  url: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  blurhash?: string | null;
}

class ActivityCoordinatesResponseDto {
  @ApiProperty({ type: Number })
  latitude: number;

  @ApiProperty({ type: Number })
  longitude: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  altitude?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  accuracy?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  altitudeAccuracy?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  heading?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  speed?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  timestamp?: number | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  mocked?: boolean | null;
}

class ActivityLocationResponseDto {
  @ApiPropertyOptional({ type: Number, nullable: true })
  timestamp?: number | null;

  @ApiProperty({ type: ActivityCoordinatesResponseDto })
  coords: ActivityCoordinatesResponseDto;
}

class ActivityKilometreSplitResponseDto {
  @ApiProperty({ type: Number })
  lastKilometerDuration: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  lastKilometerSteps?: number | null;

  @ApiProperty({ type: Number })
  lastKilometerAltitude: number;

  @ApiProperty({ type: ActivityLocationResponseDto })
  kilometerPoint: ActivityLocationResponseDto;
}

export class ActivityMediaResponseDto {
  @ApiProperty({ type: [ActivityMediaItemDto] })
  media: ActivityMediaItemDto[];

  @ApiProperty({ type: Boolean })
  hasMore: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiPropertyOptional({ type: Boolean, deprecated: true })
  isLastPage?: boolean;
}

export class ActivityMediaParamsDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsUUID()
  @IsNotEmpty()
  mediaId: string;
}

export class ActivityLocationsResponseDto {
  @ApiPropertyOptional({ type: [ActivityLocationResponseDto], nullable: true })
  locations?: ActivityLocationResponseDto[] | null;

  @ApiPropertyOptional({ type: [ActivityKilometreSplitResponseDto], nullable: true })
  kilometresSplit?: ActivityKilometreSplitResponseDto[] | null;
}

class ActivityUserEmailResponseDto {
  @ApiProperty({ type: String, format: 'email' })
  email: string;
}

class ActivityProfileResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  surname: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  name: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhoto: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhotoBlurhash: string | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  emailNotifications: boolean | null;

  @ApiPropertyOptional({ type: ActivityUserEmailResponseDto, nullable: true })
  user?: ActivityUserEmailResponseDto | null;
}

class ActivityCountResponseDto {
  @ApiProperty({ type: Number })
  comments: number;

  @ApiProperty({ type: Number })
  likes: number;
}

export class ActivityResponseDto extends ActivityDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  userId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  profileId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date | string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date | string;

  @ApiProperty({ type: Number, minimum: 0 })
  elevationGain: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true, description: 'Estimated active calories' })
  caloriesActive?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  source?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  sourceActivityId?: string | null;
}

export class ActivityCardResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  title?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  date: Date | string;

  @ApiPropertyOptional({ type: String, description: 'IANA time zone at activity creation' })
  timeZone?: string;

  @ApiProperty({ type: String })
  sport: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: ACTIVITY_VISIBILITY })
  visibility: ActivityVisibility;

  @ApiPropertyOptional({ type: [ActivityMediaItemDto], nullable: true })
  media?: ActivityMediaItemDto[] | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mapPhotoUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mapPhotoUrlBlurhash?: string | null;

  @ApiProperty({ type: Number })
  duration: number;

  @ApiProperty({ type: Number })
  distance: number;

  @ApiProperty({ type: Number, minimum: 0 })
  elevationGain: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true, description: 'Estimated active calories' })
  caloriesActive?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  steps?: number | null;

  @ApiProperty({ type: ActivityProfileResponseDto })
  profile: ActivityProfileResponseDto;

  @ApiProperty({ type: ActivityCountResponseDto })
  _count: ActivityCountResponseDto;
}

export class ActivityDetailsResponseDto extends ActivityCardResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  emotion?: string | null;

  @ApiPropertyOptional({ type: [ActivityKilometreSplitResponseDto], nullable: true })
  kilometresSplit?: ActivityKilometreSplitResponseDto[] | null;
}

export class ActivityListResponseDto {
  @ApiProperty({ type: [ActivityCardResponseDto] })
  activities: ActivityCardResponseDto[];

  @ApiPropertyOptional({ type: ActivityProfileResponseDto, nullable: true })
  currentUserProfile?: ActivityProfileResponseDto | null;

  @ApiProperty({ type: Boolean })
  hasMore: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;

  @ApiPropertyOptional({ type: Boolean, deprecated: true })
  isLastPage?: boolean;
}
