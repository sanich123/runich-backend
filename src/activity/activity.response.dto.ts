import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityDto } from './activity.dto';

export class ActivityPhotoResponseDto {
  @ApiProperty({ type: String })
  url: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  blurhash?: string | null;
}

export class ActivityCoordinatesResponseDto {
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

export class ActivityLocationResponseDto {
  @ApiProperty({ type: ActivityCoordinatesResponseDto })
  coords: ActivityCoordinatesResponseDto;
}

export class ActivityKilometreSplitResponseDto {
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
  @ApiProperty({ type: [ActivityPhotoResponseDto] })
  photos: ActivityPhotoResponseDto[];

  @ApiProperty({ type: Boolean })
  isLastPage: boolean;
}

export class ActivityLocationsResponseDto {
  @ApiPropertyOptional({ type: [ActivityLocationResponseDto], nullable: true })
  locations?: ActivityLocationResponseDto[] | null;

  @ApiPropertyOptional({ type: [ActivityKilometreSplitResponseDto], nullable: true })
  kilometresSplit?: ActivityKilometreSplitResponseDto[] | null;
}

export class ActivityUserEmailResponseDto {
  @ApiProperty({ type: String, format: 'email' })
  email: string;
}

export class ActivityProfileResponseDto {
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

export class ActivityCountResponseDto {
  @ApiProperty({ type: Number })
  comments: number;
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

  @ApiProperty({ type: String })
  sport: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  userId: string;

  @ApiPropertyOptional({ type: [ActivityPhotoResponseDto], nullable: true })
  photoVideoUrls?: ActivityPhotoResponseDto[] | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mapPhotoUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mapPhotoUrlBlurhash?: string | null;

  @ApiProperty({ type: Number })
  duration: number;

  @ApiProperty({ type: Number })
  distance: number;

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

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  isPublic?: boolean | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  emotion?: string | null;

  @ApiPropertyOptional({ type: [ActivityKilometreSplitResponseDto], nullable: true })
  kilometresSplit?: ActivityKilometreSplitResponseDto[] | null;
}

export class ActivityListResponseDto {
  @ApiProperty({ type: [ActivityCardResponseDto] })
  activities: ActivityCardResponseDto[];

  @ApiProperty({ type: Boolean })
  isLastPage: boolean;
}

export class ActivityImportResponseDto {
  @ApiProperty({ type: Boolean })
  success: boolean;
}
