import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  MAX_ACTIVITY_HEART_RATE_SAMPLES,
  MAX_ACTIVITY_LOCATIONS,
  MAX_RAW_ACTIVITY_LOCATIONS,
} from 'src/common/constants';
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
  IsIn,
  MaxLength,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsIanaTimeZoneConstraint } from 'src/common/validation/iana-time-zone.validator';
import { ACTIVITY_VISIBILITY, type ActivityVisibility } from '../shared/activity-visibility';

class ActivityMediaDto {
  @ApiPropertyOptional({ type: String, description: 'Опубликованный URL уже прошедшего проверку медиафайла' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Идентификатор загруженного файла на проверке' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Идентификатор проверяемой миниатюры видео' })
  @IsOptional()
  @IsUUID()
  thumbnailAssetId?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsString()
  thumbnail?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  blurhash?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0.01, maximum: 100, nullable: true })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  @Max(100)
  @IsOptional()
  aspectRatio?: number | null;
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

export type ActivityChartLocationObject = {
  timestamp: number;
  coords: {
    altitude?: number;
    speed?: number;
    timestamp?: number;
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
  url?: string;
  thumbnail?: string | null;
  assetId?: string;
  thumbnailAssetId?: string;
  mediaReviewStatus?: 'queued' | 'processing' | 'review_required' | 'approved' | 'rejected' | 'failed' | null;
  blurhash?: string | null;
  aspectRatio?: number | null;
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

  @ApiPropertyOptional({ type: Number, minimum: 0, description: 'Active calories recorded by the activity source' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @IsOptional()
  caloriesActive?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, description: 'Number of steps recorded during the activity' })
  @IsInt()
  @Min(0)
  @IsOptional()
  steps?: number;

  @ApiPropertyOptional({ enum: ['health-connect', 'healthkit'], description: 'Source of an imported activity' })
  @IsIn(['health-connect', 'healthkit'])
  @IsOptional()
  source?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 128, description: 'Stable identifier in the source health store' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  sourceActivityId?: string | null;

  @ApiPropertyOptional({
    type: String,
    maxLength: 128,
    description: 'Application that wrote the workout to the health store',
  })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  sourceAppName?: string | null;

  @ApiPropertyOptional({
    type: String,
    maxLength: 128,
    description: 'Manufacturer of the device that recorded the workout',
  })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  recordingDeviceManufacturer?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 128, description: 'Model of the device that recorded the workout' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  recordingDeviceModel?: string | null;

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

  @ApiPropertyOptional({ type: Boolean, description: 'Hide the base map while keeping the route visible' })
  @IsBoolean()
  @IsOptional()
  hideMap?: boolean;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Photo and video URLs',
    maxItems: UPLOAD_LIMITS.activityMediaFiles,
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        thumbnail: { type: 'string', nullable: true },
        assetId: { type: 'string', format: 'uuid' },
        thumbnailAssetId: { type: 'string', format: 'uuid' },
        blurhash: { type: 'string' },
      },
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

export class ActivityRouteLocationsDto {
  @ApiProperty({ type: [ActivityLocationDto], minItems: 2, maxItems: MAX_RAW_ACTIVITY_LOCATIONS })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_RAW_ACTIVITY_LOCATIONS)
  @ValidateNested({ each: true })
  @Type(() => ActivityLocationDto)
  locations: LocationObject[];
}

export type ActivityHeartRateSampleObject = {
  timestamp: number;
  beatsPerMinute: number;
};

export class ActivityHeartRateSampleDto {
  @ApiProperty({ type: Number, minimum: 0, description: 'Unix timestamp in milliseconds' })
  @IsInt()
  @Min(0)
  timestamp: number;

  @ApiProperty({ type: Number, minimum: 1, maximum: 300, description: 'Heart rate in beats per minute' })
  @IsInt()
  @Min(1)
  @Max(300)
  beatsPerMinute: number;
}

export class WatchWorkoutImportDto extends ActivityDto {
  @ApiPropertyOptional({ type: [ActivityHeartRateSampleDto], maxItems: MAX_ACTIVITY_HEART_RATE_SAMPLES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ACTIVITY_HEART_RATE_SAMPLES)
  @ValidateNested({ each: true })
  @Type(() => ActivityHeartRateSampleDto)
  @IsOptional()
  heartRateSamples?: ActivityHeartRateSampleObject[];
  @ApiProperty({ enum: ['health-connect', 'healthkit'] })
  @IsIn(['health-connect', 'healthkit'])
  source: 'health-connect' | 'healthkit' = 'health-connect';

  @ApiProperty({ type: String, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sourceActivityId: string = '';
}

export class WatchWorkoutBatchImportDto {
  @ApiProperty({ type: [WatchWorkoutImportDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WatchWorkoutImportDto)
  workouts: WatchWorkoutImportDto[];
}

export class WatchWorkoutImportIdentityDto {
  @ApiProperty({ enum: ['health-connect', 'healthkit'] })
  @IsIn(['health-connect', 'healthkit'])
  source: 'health-connect' | 'healthkit';

  @ApiProperty({ type: String, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sourceActivityId: string;

  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceAppName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  recordingDeviceManufacturer?: string;

  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  recordingDeviceModel?: string;
}

export class WatchWorkoutSyncCandidatesRequestDto {
  @ApiProperty({ type: [WatchWorkoutImportIdentityDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WatchWorkoutImportIdentityDto)
  workouts: WatchWorkoutImportIdentityDto[];
}
