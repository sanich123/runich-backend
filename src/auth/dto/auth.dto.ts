import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ type: String, description: 'Email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ type: String, description: 'Password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @ApiProperty()
  password: string;
}

export class LoginCodeDto {
  @ApiProperty({ type: String, description: 'One-time email/OAuth exchange code' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class ProviderAccessTokenDto {
  @ApiProperty({ type: String, description: 'Provider access token issued by the native sign-in SDK' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  accessToken: string;
}

export class NativeVkAuthCodeDto {
  @ApiProperty({ type: String, description: 'Authorization code returned by VK ID Android SDK' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  code: string;

  @ApiProperty({ type: String, description: 'Device identifier returned by VK ID Android SDK' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  deviceId: string;

  @ApiProperty({ type: String, description: 'PKCE verifier generated for this authorization attempt' })
  @IsString()
  @Matches(/^[A-Za-z0-9._~-]{43,128}$/)
  codeVerifier: string;
}

export class RefreshTokenDto {
  @ApiProperty({ type: String, description: 'Refresh Token' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}

export class SessionLocationDto {
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class ConfirmationCodeDto {
  @ApiProperty({ type: String, description: 'Confirmation code' })
  @IsNotEmpty()
  @IsString()
  confirmationCode: string;

  @ApiProperty({ type: String, description: 'Email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class GetEmailCodeForPasswordDto {
  @ApiProperty({ type: String, description: 'Email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class EmailLoginLinkDto {
  @ApiProperty({ type: String, description: 'Email пользователя' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class ChangePasswordDto {
  @ApiProperty({ type: String, description: 'New password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/[A-Z]/)
  @Matches(/\d/)
  password1: string;

  @ApiProperty({ type: String, description: 'New password confirmation' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/[A-Z]/)
  @Matches(/\d/)
  password2: string;

  @ApiProperty({ type: String, description: 'Email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class PasswordChangeCodeDto {
  @ApiProperty({ type: String, description: 'Password change code' })
  @IsNotEmpty()
  @IsString()
  confirmationCode: string;

  @ApiProperty({ type: String, description: 'Email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: String, description: 'Access Token' })
  accessToken: string;
}

class UserAuthResponseDto extends AuthResponseDto {
  @ApiProperty({ type: String, description: 'User identifier' })
  userId: string;
}

export class LoginResponseDto extends UserAuthResponseDto {
  @ApiProperty({ type: String, description: 'Refresh Token' })
  refreshToken: string;
}

export class AppConfigResponseDto {
  @ApiProperty({ type: String, description: 'Minimum supported client app version' })
  appVersion: string;
}

export class MessageResponseDto {
  @ApiProperty({ type: String, description: 'Result message' })
  message: string;
}

export class UserIdParamsDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
