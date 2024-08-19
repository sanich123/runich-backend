import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

type LocationObject = {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed: number;
  timestamp: number;
  mocked?: boolean;
};

export class ActivityDto {
  @ApiProperty({ type: Number, description: 'Duration' })
  @IsNotEmpty()
  @IsNumber()
  duration: number;

  @ApiProperty({ type: Number, description: 'Distance' })
  @IsNotEmpty()
  @IsNumber()
  distance: number;

  @ApiProperty({ type: Number, description: 'Speed' })
  @IsNotEmpty()
  @IsNumber()
  speed: number;

  @ApiProperty({ type: String, description: 'Sport value' })
  @IsString()
  @IsNotEmpty()
  sport: string;

  @ApiPropertyOptional({ type: Date, description: 'Date value' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ type: String, description: 'Description value' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: String, description: 'Emotion value' })
  @IsString()
  @IsOptional()
  emotion?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Is activity public or private' })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ isArray: true, description: 'Photo video urls value' })
  @IsOptional()
  @IsArray()
  photoVideoUrls: { url: string; thumbnail: string | null; blurhash?: string }[];

  @ApiPropertyOptional({ description: 'Image of map with points of activity' })
  @IsOptional()
  @IsString()
  mapPhotoUrl?: string;

  @ApiPropertyOptional({ description: 'Image of map with points of activity' })
  @IsOptional()
  @IsString()
  mapPhotoUrlBlurhash?: string;

  @ApiPropertyOptional({ type: String, description: 'Title value' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ type: Array, description: 'Location data' })
  @IsArray()
  @IsOptional()
  locations?: LocationObject[];

  @ApiPropertyOptional({ type: Array, description: 'Km splits' })
  @IsArray()
  @IsOptional()
  kilometresSplit: {
    lastKilometerDuration: number;
    lastKilometerAltitude: number;
    kilometerPoint: LocationObject;
  }[];
}
