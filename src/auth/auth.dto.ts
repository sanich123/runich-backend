import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

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
  @ApiProperty({ type: String, description: 'Access Token' })
  @IsNotEmpty()
  @IsString()
  accessToken: string;
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
