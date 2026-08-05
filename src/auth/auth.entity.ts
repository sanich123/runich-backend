import { ApiProperty } from '@nestjs/swagger';

export class AuthEntity {
  @ApiProperty({ type: String, description: 'Access Token' })
  accessToken: string;
}
