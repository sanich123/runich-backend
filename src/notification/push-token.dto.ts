import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { PUSH_TOKEN_DTO_DESCRIPTION } from './notification.constants';

export class PushTokenDto {
  @ApiProperty({ type: String, description: PUSH_TOKEN_DTO_DESCRIPTION })
  @IsString()
  @MaxLength(512)
  @Matches(/^(Expo|Exponent)PushToken\[[^\]]+\]$/)
  token!: string;

  @ApiProperty({ enum: ['android'] })
  @IsIn(['android'])
  platform!: 'android';
}
