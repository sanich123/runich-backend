import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UserDto {
  @ApiPropertyOptional({ type: String, description: "User's name" })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: String, description: "Users's surname" })
  @IsString()
  @IsOptional()
  surname?: string;

  @ApiPropertyOptional({ type: String, description: "User's biography" })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ type: String, description: "User's birthday" })
  @IsString()
  @IsOptional()
  birthday?: string;

  @ApiPropertyOptional({ type: String, description: "User's city" })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ type: String, description: "User's gender" })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ type: String, description: "User's photo" })
  @IsString()
  @IsOptional()
  profilePhoto?: string;

  @ApiPropertyOptional({ type: String, description: "User's photo (blurhash value)" })
  @IsString()
  @IsOptional()
  profilePhotoBlurhash?: string;

  @ApiPropertyOptional({ type: String, description: "User's choosed sport" })
  @IsString()
  @IsOptional()
  sport?: string;

  @ApiPropertyOptional({ type: String, description: "User's weight" })
  @IsString()
  @IsOptional()
  weight?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Is user allow to notificate him by email' })
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ type: String, description: "User's email" })
  @IsEmail()
  @IsOptional()
  email?: string;
}
