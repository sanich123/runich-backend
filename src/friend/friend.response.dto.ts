import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FriendProfileResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  surname: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  name: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhoto: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  profilePhotoBlurhash: string | null;
}

export class FriendUserResponseDto {
  @ApiPropertyOptional({ type: FriendProfileResponseDto, nullable: true })
  profile: FriendProfileResponseDto | null;
}

export class FriendResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date | string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date | string;

  @ApiProperty({ type: String, format: 'uuid' })
  user_id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  friendId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  profileId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ type: FriendProfileResponseDto, nullable: true })
  profile?: FriendProfileResponseDto | null;

  @ApiPropertyOptional({ type: FriendUserResponseDto, nullable: true })
  users?: FriendUserResponseDto | null;
}
