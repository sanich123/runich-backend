import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export type LocationObject = {
  coords: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
    timestamp?: number;
    mocked?: boolean;
  };
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

  @ApiPropertyOptional({
    type: 'array',
    description: 'Photo and video URLs',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        thumbnail: { type: 'string', nullable: true },
        blurhash: { type: 'string' },
      },
      required: ['url', 'thumbnail'],
    },
  })
  @IsOptional()
  @IsArray()
  photoVideoUrls?: { url: string; thumbnail: string | null; blurhash?: string }[];

  @ApiPropertyOptional({ type: String, description: 'Image of map with points of activity' })
  @IsOptional()
  @IsString()
  mapPhotoUrl?: string;

  @ApiPropertyOptional({ type: String, description: 'Blurhash for the map image' })
  @IsOptional()
  @IsString()
  mapPhotoUrlBlurhash?: string;

  @ApiPropertyOptional({ type: String, description: 'Title value' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    type: 'array',
    description: 'Location data',
    items: {
      type: 'object',
      properties: {
        coords: {
          type: 'object',
          properties: {
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            altitude: { type: 'number' },
            accuracy: { type: 'number' },
            altitudeAccuracy: { type: 'number' },
            heading: { type: 'number' },
            speed: { type: 'number' },
            timestamp: { type: 'number' },
            mocked: { type: 'boolean' },
          },
          required: ['latitude', 'longitude'],
        },
      },
      required: ['coords'],
    },
  })
  @IsArray()
  @IsOptional()
  locations?: LocationObject[];

  @ApiPropertyOptional({
    type: 'array',
    description: 'Kilometre splits',
    items: {
      type: 'object',
      properties: {
        lastKilometerDuration: { type: 'number' },
        lastKilometerAltitude: { type: 'number' },
        kilometerPoint: { type: 'object' },
      },
      required: ['lastKilometerDuration', 'lastKilometerAltitude', 'kilometerPoint'],
    },
  })
  @IsArray()
  @IsOptional()
  kilometresSplit?: {
    lastKilometerDuration: number;
    lastKilometerAltitude: number;
    kilometerPoint: LocationObject;
  }[];
}
