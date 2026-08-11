import { ApiProperty } from '@nestjs/swagger';

export class AuthEntity {
  @ApiProperty({ type: String, description: 'Access Token' })
  accessToken: string;
}

export class UserAuthEntity extends AuthEntity {
  @ApiProperty({ type: String, description: 'User identifier' })
  userId: string;
}

export class LoginEntity extends UserAuthEntity {
  @ApiProperty({ type: String, description: 'Refresh Token' })
  refreshToken: string;
}

export class AppConfigEntity {
  @ApiProperty({ type: String, description: 'Application version' })
  appVersion: string;
}

export class MessageEntity {
  @ApiProperty({ type: String, description: 'Result message' })
  message: string;
}
