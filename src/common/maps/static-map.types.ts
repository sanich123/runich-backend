import type { LocationObject } from 'src/activity/dto/activity.dto';

export type GeneratedActivityMap = {
  url: string;
  key?: string;
};

export type GenerateActivityMapInput = {
  userId: string;
  activityId?: string;
  locations: LocationObject[];
  hideMap?: boolean;
};
