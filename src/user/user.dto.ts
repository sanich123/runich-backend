import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const WEIGHT_PATTERN = /^(?:\d|[1-9]\d|1\d\d|200)$/;
const HEIGHT_PATTERN = /^(?:\d|[1-9]\d|1\d\d|2[0-2]\d|230)$/;
const AGE_PATTERN = /^(?:\d|[1-9]\d|100)$/;
const RESTING_HEART_RATE_PATTERN = /^(?:[3-9]\d|1\d\d|200)$/;
const MAX_HEART_RATE_PATTERN = /^(?:[8-9]\d|1\d\d|2[0-4]\d|250)$/;

export class UserDto {
  @ApiPropertyOptional({ type: String, description: "User's name" })
  @IsString()
  @IsOptional()
  name?: string | null;

  @ApiPropertyOptional({ type: String, description: "Users's surname" })
  @IsString()
  @IsOptional()
  surname?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's biography" })
  @IsString()
  @IsOptional()
  bio?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's birthday" })
  @IsDateString()
  @IsOptional()
  birthday?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's city" })
  @IsString()
  @IsOptional()
  city?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's gender" })
  @IsString()
  @IsOptional()
  gender?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's height in centimeters" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(HEIGHT_PATTERN, { message: 'Рост должен быть целым числом не более 230 см' })
  @IsOptional()
  height?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's age in years" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(AGE_PATTERN, { message: 'Возраст должен быть целым числом не более 100 лет' })
  @IsOptional()
  age?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's resting heart rate in beats per minute" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(RESTING_HEART_RATE_PATTERN, { message: 'Пульс в покое должен быть целым числом от 30 до 200 уд/мин' })
  @IsOptional()
  restingHeartRate?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's maximum heart rate in beats per minute" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(MAX_HEART_RATE_PATTERN, { message: 'Максимальный пульс должен быть целым числом от 80 до 250 уд/мин' })
  @IsOptional()
  maxHeartRate?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's photo" })
  @IsString()
  @IsOptional()
  profilePhoto?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's photo (blurhash value)" })
  @IsString()
  @IsOptional()
  profilePhotoBlurhash?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's choosed sport" })
  @IsString()
  @IsOptional()
  sport?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's weight" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(WEIGHT_PATTERN, { message: 'Вес должен быть целым числом не более 200 кг' })
  @IsOptional()
  weight?: string | null;

  @ApiPropertyOptional({ type: Boolean, description: 'Is user allow to notificate him by email' })
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean | null;

  @ApiPropertyOptional({ type: Boolean, description: 'Enable push notifications' })
  @IsBoolean()
  @IsOptional()
  pushNotifications?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Enable notifications in the in-app notification center' })
  @IsBoolean()
  @IsOptional()
  inAppNotifications?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Allow this profile to appear in user search' })
  @IsBoolean()
  @IsOptional()
  profileSearchVisible?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Allow likes, comments, and viewing the list of likes on this user activities',
  })
  @IsBoolean()
  @IsOptional()
  allowActivityInteractions?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to view activity route replays' })
  @IsBoolean()
  @IsOptional()
  allowActivityReplayViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to view heart rate data on activities' })
  @IsBoolean()
  @IsOptional()
  allowActivityHeartRateViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to view elevation data on activities' })
  @IsBoolean()
  @IsOptional()
  allowActivityElevationViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to view pace data on activities' })
  @IsBoolean()
  @IsOptional()
  allowActivityPaceViewing?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to share this profile activities' })
  @IsBoolean()
  @IsOptional()
  allowActivitySharing?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Hide the profile total activity statistics' })
  @IsBoolean()
  @IsOptional()
  hideActivityStatistics?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Hide the list of users followed by this profile' })
  @IsBoolean()
  @IsOptional()
  hideFollowingList?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Hide activity media from the profile photo gallery' })
  @IsBoolean()
  @IsOptional()
  hideProfilePhotos?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to follow this profile' })
  @IsBoolean()
  @IsOptional()
  allowNewFollowers?: boolean;

  @ApiPropertyOptional({ type: String, description: "User's email" })
  @IsEmail()
  @IsOptional()
  email?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's language" })
  @IsString()
  @IsOptional()
  language?: string | null;
}
