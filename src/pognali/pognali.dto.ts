import { IsNotEmpty } from 'class-validator';

export class TravelInfo {
  hashTags: string[];
  companions?: number;
  kidsEnabled?: boolean;
  dates: string[];
  selectedCountries?: [];
  @IsNotEmpty()
  randomUserPath: string;

  countryNames: string[];
  region: string[];

  @IsNotEmpty()
  name: string;

  gender: string;
}
