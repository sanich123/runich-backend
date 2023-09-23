export class ActivityDto {
  date: Date;
  description: string;
  duration: number;
  distance: number;
  emotion: string;
  isSwitchOn: boolean;
  photoUrls: string[];
  sport: string;
  title: string;
  speed: number;
  locations: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
    timestamp: number;
    mocked?: boolean;
  }[];
}
