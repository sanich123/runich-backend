import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const WEIGHT_PATTERN = /^(?:\d|[1-9]\d|1\d\d|200)$/;
const HEIGHT_PATTERN = /^(?:\d|[1-9]\d|1\d\d|2[0-2]\d|230)$/;
const AGE_PATTERN = /^(?:\d|[1-9]\d|100)$/;

export class UserDto {
  @ApiPropertyOptional({ type: String, description: "User's name" })
  @IsString()
  @IsOptional()
  name?: string | null;

  @ApiPropertyOptional({ type: String, description: "Users's surname" })
  @IsString()
  @IsOptional()
  surname?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's biography" })
  @IsString()
  @IsOptional()
  bio?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's birthday" })
  @IsDateString()
  @IsOptional()
  birthday?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's city" })
  @IsString()
  @IsOptional()
  city?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's gender" })
  @IsString()
  @IsOptional()
  gender?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's height in centimeters" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(HEIGHT_PATTERN, { message: 'Рост должен быть целым числом не более 230 см' })
  @IsOptional()
  height?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's age in years" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(AGE_PATTERN, { message: 'Возраст должен быть целым числом не более 100 лет' })
  @IsOptional()
  age?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's photo" })
  @IsString()
  @IsOptional()
  profilePhoto?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's photo (blurhash value)" })
  @IsString()
  @IsOptional()
  profilePhotoBlurhash?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's choosed sport" })
  @IsString()
  @IsOptional()
  sport?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's weight" })
  @ValidateIf((_object, value) => value !== null && value !== undefined && value !== '')
  @IsString()
  @Matches(WEIGHT_PATTERN, { message: 'Вес должен быть целым числом не более 200 кг' })
  @IsOptional()
  weight?: string | null;

  @ApiPropertyOptional({ type: Boolean, description: 'Is user allow to notificate him by email' })
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean | null;

  @ApiPropertyOptional({ type: String, description: "User's email" })
  @IsEmail()
  @IsOptional()
  email?: string | null;

  @ApiPropertyOptional({ type: String, description: "User's language" })
  @IsString()
  @IsOptional()
  language?: string | null;
}
