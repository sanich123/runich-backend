import { ApiProperty } from '@nestjs/swagger';

export class AuthEntity {
  @ApiProperty({ type: String, description: 'Access Token' })
  accessToken: string;
}

export class LoginEntity extends AuthEntity {
  @ApiProperty({ type: String, description: 'Refresh Token' })
  refreshToken: string;
}

export class AppConfigEntity {
  @ApiProperty({ type: String, description: 'Minimum supported application version' })
  minAppVersion: string;
}
