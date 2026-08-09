import { ApiProperty } from '@nestjs/swagger';

export class AuthEntity {
  @ApiProperty({ type: String, description: 'Access Token' })
  accessToken: string;
}

export class AppConfigEntity {
  @ApiProperty({ type: String, description: 'Minimum supported application version' })
  minAppVersion: string;
}
