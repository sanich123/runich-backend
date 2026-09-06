import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';

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

export class AccessTokenDto {
  @ApiProperty({ type: String, required: false, description: 'Legacy email access token' })
  @ValidateIf((object) => object.accessToken !== undefined || !object.code)
  @IsString()
  @IsNotEmpty()
  accessToken?: string;

  @ApiProperty({ type: String, required: false, description: 'One-time email/OAuth exchange code' })
  @ValidateIf((object) => object.code !== undefined || !object.accessToken)
  @IsString()
  @IsNotEmpty()
  code?: string;
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
