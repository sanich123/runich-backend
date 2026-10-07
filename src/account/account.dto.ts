import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileDto {
  @ApiPropertyOptional({ type: String, description: 'Id value (optional)' })
  id?: string;
  @ApiPropertyOptional({ type: String, description: 'User identifier (optional)' })
  userId?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Creation date (optional)' })
  createdAt?: Date | string;
  @ApiPropertyOptional({ type: String, description: 'Name value (optional)' })
  name?: string | null;
  @ApiPropertyOptional({ type: String, description: 'bio value (optional)' })
  bio?: string | null;
  @ApiPropertyOptional({ type: String, description: 'birthday value (optional)' })
  birthday?: Date | string | null;
  @ApiPropertyOptional({ type: String, description: 'city value (optional)' })
  city?: string | null;
  @ApiPropertyOptional({ type: String, description: 'gender value (optional)' })
  gender?: string | null;
  @ApiPropertyOptional({ type: String, description: 'height in centimeters (optional)' })
  height?: string | null;
  @ApiPropertyOptional({ type: String, description: 'age in years (optional)' })
  age?: string | null;
  @ApiPropertyOptional({ type: String, description: 'profilePhoto value (optional)' })
  profilePhoto?: string | null;
  @ApiPropertyOptional({ type: String, description: 'sport value (optional)' })
  sport?: string | null;
  @ApiPropertyOptional({ type: String, description: 'surname value (optional)' })
  surname?: string | null;
  @ApiPropertyOptional({ type: String, description: 'updatedAt value (optional)' })
  updatedAt?: Date | string | null;
  @ApiPropertyOptional({ type: String, description: 'Language value (optional)' })
  language?: string | null;
  @ApiPropertyOptional({ type: String, description: 'birthday value (optional)' })
  weight?: string | null;
  @ApiPropertyOptional({ type: String, description: 'Profile photo blurhash (optional)' })
  profilePhotoBlurhash?: string | null;
  @ApiPropertyOptional({ type: Boolean, description: 'Email notifications enabled' })
  emailNotifications?: boolean | null;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow this profile to appear in user search' })
  profileSearchVisible?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow likes and comments on this user activities' })
  allowActivityInteractions?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to view the activity likes list' })
  allowLikesListViewing?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to view activity route replays' })
  allowActivityReplayViewing?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to share this profile activities' })
  allowActivitySharing?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Hide the profile total activity statistics' })
  hideActivityStatistics?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Hide the list of users followed by this profile' })
  hideFollowingList?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Hide activity media from the profile photo gallery' })
  hideProfilePhotos?: boolean;
  @ApiPropertyOptional({ type: Boolean, description: 'Allow other users to follow this profile' })
  allowNewFollowers?: boolean;
  @ApiPropertyOptional({ type: String, description: 'Email value (optional)' })
  email?: string | null;
}

export class ProfilePaginationResponseDto {
  @ApiProperty({ type: [ProfileDto] })
  items: ProfileDto[];

  @ApiProperty({ type: Boolean })
  hasMore: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}
