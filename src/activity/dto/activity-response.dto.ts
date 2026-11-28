import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MAX_ACTIVITY_HEART_RATE_SAMPLES } from 'src/common/constants';
import type { ProfilePhotoReviewStatus } from 'src/account/account.types';
import { IsBoolean, IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';
import { ActivityDto, ActivityHeartRateSampleDto, WatchWorkoutImportIdentityDto } from './activity-input.dto';
import type { ActivityHeartRateSampleObject } from './activity-input.dto';
import { ACTIVITY_VISIBILITY, type ActivityVisibility } from '../shared/activity-visibility';

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

  @ApiPropertyOptional({ type: String, nullable: true })
  url: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  blurhash?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Соотношение сторон фото или видео' })
  aspectRatio?: number | null;

  @ApiPropertyOptional({
    enum: ['queued', 'processing', 'review_required', 'approved', 'rejected', 'failed'],
    nullable: true,
  })
  mediaReviewStatus?: 'queued' | 'processing' | 'review_required' | 'approved' | 'rejected' | 'failed' | null;
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

  @ApiPropertyOptional({ type: ActivityLocationResponseDto })
  kilometerPoint?: ActivityLocationResponseDto;
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

class ActivityChartCoordinatesResponseDto {
  @ApiPropertyOptional({ type: Number, nullable: true })
  altitude?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'GPS-derived speed in kilometres per hour' })
  speed?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  timestamp?: number | null;
}

class ActivityChartLocationResponseDto {
  @ApiProperty({ type: Number })
  timestamp: number;

  @ApiProperty({ type: ActivityChartCoordinatesResponseDto })
  coords: ActivityChartCoordinatesResponseDto;
}

export class ActivityChartDataResponseDto {
  @ApiProperty({ type: [ActivityHeartRateSampleDto], maxItems: MAX_ACTIVITY_HEART_RATE_SAMPLES })
  heartRateSamples: ActivityHeartRateSampleObject[];

  @ApiPropertyOptional({ type: [ActivityChartLocationResponseDto], nullable: true })
  locations?: ActivityChartLocationResponseDto[] | null;
}

class ActivityUserEmailResponseDto {
  @ApiProperty({ type: String, format: 'email' })
  email: string;
}

class ActivityProfileResponseDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  userId?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  surname: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  name: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhoto: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhotoBlurhash: string | null;

  @ApiPropertyOptional({ type: String, enum: ['queued', 'processing', 'review_required'], nullable: true })
  profilePhotoReviewStatus?: ProfilePhotoReviewStatus | null;

  @ApiPropertyOptional({ type: Boolean })
  allowActivityInteractions?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  allowActivityReplayViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  allowActivityHeartRateViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  allowActivityElevationViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  allowActivityPaceViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  allowActivitySharing?: boolean;

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

  @ApiPropertyOptional({ type: String, nullable: true })
  source?: string | null = undefined;

  @ApiPropertyOptional({ type: String, nullable: true })
  sourceActivityId?: string | null = undefined;

  @ApiPropertyOptional({ type: String, nullable: true })
  sourceAppName?: string | null = undefined;

  @ApiPropertyOptional({ type: String, nullable: true })
  recordingDeviceManufacturer?: string | null = undefined;

  @ApiPropertyOptional({ type: String, nullable: true })
  recordingDeviceModel?: string | null = undefined;
}

export class WatchWorkoutBatchImportResponseDto {
  @ApiProperty({ type: Number })
  imported: number;

  @ApiProperty({ type: Number })
  skipped: number;

  @ApiProperty({ type: [ActivityResponseDto] })
  activities: ActivityResponseDto[];
}

export class WatchWorkoutSyncCandidatesResponseDto {
  @ApiProperty({ type: [WatchWorkoutImportIdentityDto] })
  workoutsToSync: WatchWorkoutImportIdentityDto[];
}

export class SetActivityFavoriteDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  isFavorite: boolean;
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

  @ApiPropertyOptional({ type: String, nullable: true })
  source?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  sourceAppName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  recordingDeviceManufacturer?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  recordingDeviceModel?: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  userId: string;

  @ApiProperty({ type: Boolean })
  isFavorite: boolean;

  @ApiProperty({ enum: ACTIVITY_VISIBILITY })
  visibility: ActivityVisibility;

  @ApiProperty({ type: Boolean })
  hideMap: boolean;

  @ApiPropertyOptional({ type: [ActivityMediaItemDto], nullable: true })
  media?: ActivityMediaItemDto[] | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mapPhotoUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  routeOnlyMapPhotoUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mapPhotoUrlBlurhash?: string | null;

  @ApiProperty({ type: Number })
  duration: number;

  @ApiProperty({ type: Number })
  distance: number;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  elevationGain: number | null;

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

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 300, nullable: true })
  averageHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 300, nullable: true })
  minHeartRate?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 300, nullable: true })
  maxHeartRate?: number | null;
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

class ActivityRouteFilterOptionsResponseDto {
  @ApiProperty({ type: [Number] })
  years: number[];

  @ApiProperty({ type: [Number] })
  months: number[];

  @ApiProperty({ type: [Number] })
  days: number[];
}

class ActivityRouteWorkoutCardResponseDto extends ActivityCardResponseDto {
  @ApiProperty({ type: Number, minimum: 2, description: 'Number of recorded GPS route points' })
  routePointCount: number;
}

export class ActivitiesWithRoutesResponseDto extends ActivityListResponseDto {
  @ApiProperty({ type: [ActivityRouteWorkoutCardResponseDto] })
  declare activities: ActivityRouteWorkoutCardResponseDto[];

  @ApiProperty({ type: ActivityRouteFilterOptionsResponseDto })
  availableFilters: ActivityRouteFilterOptionsResponseDto;
}

export class HomeActivityFeedsResponseDto {
  @ApiProperty({ type: ActivityListResponseDto })
  my: ActivityListResponseDto;

  @ApiProperty({ type: ActivityListResponseDto })
  followers: ActivityListResponseDto;

  @ApiProperty({ type: ActivityListResponseDto })
  favorites: ActivityListResponseDto;
}
