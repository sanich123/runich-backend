import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

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

export class UserAuthResponseDto extends AuthResponseDto {
  @ApiProperty({ type: String, description: 'User identifier' })
  userId: string;
}

export class LoginResponseDto extends UserAuthResponseDto {
  @ApiProperty({ type: String, description: 'Refresh Token' })
  refreshToken: string;
}

export class AppConfigResponseDto {
  @ApiProperty({ type: String, description: 'Application version' })
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
