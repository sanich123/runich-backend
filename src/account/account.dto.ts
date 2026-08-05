import { ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileDto {
  @ApiPropertyOptional({ type: String, description: 'Id value (optional)' })
  id?: string;
  @ApiPropertyOptional({ type: String, description: 'Name value (optional)' })
  name?: string | null;
  @ApiPropertyOptional({ type: String, description: 'bio value (optional)' })
  bio?: string | null;
  @ApiPropertyOptional({ type: String, description: 'birthday value (optional)' })
  birthday?: Date | string | null;
  @ApiPropertyOptional({ type: String, description: 'city value (optional)' })
  city?: string | null;
  @ApiPropertyOptional({ type: String, description: 'createdAt value (optional)' })
  createdAt?: Date | string;
  @ApiPropertyOptional({ type: String, description: 'gender value (optional)' })
  gender?: string | null;
  @ApiPropertyOptional({ type: String, description: 'profilePhoto value (optional)' })
  profilePhoto?: string | null;
  profilePhotoBlurhash?: string;
  @ApiPropertyOptional({ type: String, description: 'sport value (optional)' })
  sport?: string | null;
  @ApiPropertyOptional({ type: String, description: 'surname value (optional)' })
  surname?: string | null;
  @ApiPropertyOptional({ type: String, description: 'updatedAt value (optional)' })
  updatedAt?: Date | string;
  @ApiPropertyOptional({ type: String, description: 'birthday value (optional)' })
  weight?: string | null;
  @ApiPropertyOptional({ type: Boolean, description: 'Email notifications enabled' })
  emailNotifications: boolean;
  @ApiPropertyOptional({ type: String, description: 'Email value (optional)' })
  email: string;
}
