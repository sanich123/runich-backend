import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ type: Date, description: 'Date value' })
  date: Date;
  @ApiPropertyOptional({ type: String, description: 'Description value' })
  description?: string;
  @ApiProperty({ type: Number, description: 'Duration' })
  duration: number;
  @ApiProperty({ type: Number, description: 'Distance' })
  distance: number;
  @ApiPropertyOptional({ type: String, description: 'Emotion value' })
  emotion?: string;
  @ApiPropertyOptional({ type: Boolean, description: 'Public switcher value' })
  isPublic: boolean;
  @ApiPropertyOptional({ isArray: true, description: 'Photo video urls value' })
  photoVideoUrls: { url: string; thumbnail: string | null };
  @ApiProperty({ type: String, description: 'Sport value' })
  sport: string;
  @ApiPropertyOptional({ type: String, description: 'Title value' })
  title?: string;
  @ApiProperty({ type: Number, description: 'Speed' })
  speed: number;
  @ApiProperty({ type: Array, description: 'Location data' })
  locations: LocationObject[];
  @ApiPropertyOptional({ type: Array, description: 'Km splits' })
  kilometresSplit: {
    lastKilometerDuration: number;
    lastKilometerAltitude: number;
    kilometerPoint: LocationObject;
  }[];
}
