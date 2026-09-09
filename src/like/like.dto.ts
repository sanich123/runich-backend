import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { ProfileDto } from 'src/account/account.dto';

export class LikeDto {
  @IsUUID()
  @IsNotEmpty()
  @ApiProperty({ description: 'activity identificator', nullable: false, type: String })
  activityId: string;
}

export class LikeResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  date: Date | string;

  @ApiProperty({ type: String, format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'uuid' })
  activityId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  profileId: string;

  @ApiPropertyOptional({ type: ProfileDto, nullable: true })
  profile?: ProfileDto | null;
}
