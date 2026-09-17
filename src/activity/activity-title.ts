import { DEFAULT_TIME_ZONE, getLocalDateTimeParts } from 'src/common/utils/time-zone';

type ActivityTitleGender = 'masculine' | 'feminine' | 'neuter';

type ActivityName = {
  name: string;
  gender: ActivityTitleGender;
};

type TimeOfDay = {
  untilHour: number;
  adjectives: Record<ActivityTitleGender, string>;
};

// Общепринятые границы: ночь — 00:00–05:59, утро — 06:00–11:59,
// день — 12:00–17:59, вечер — 18:00–23:59.
const timeOfDay: TimeOfDay[] = [
  {
    untilHour: 6,
    adjectives: { masculine: 'Ночной', feminine: 'Ночная', neuter: 'Ночное' },
  },
  {
    untilHour: 12,
    adjectives: { masculine: 'Утренний', feminine: 'Утренняя', neuter: 'Утреннее' },
  },
  {
    untilHour: 18,
    adjectives: { masculine: 'Дневной', feminine: 'Дневная', neuter: 'Дневное' },
  },
  {
    untilHour: 24,
    adjectives: { masculine: 'Вечерний', feminine: 'Вечерняя', neuter: 'Вечернее' },
  },
];

function getActivityName(sport: string): ActivityName {
  const normalizedSport = sport.trim().toLocaleLowerCase();

  if (normalizedSport.includes('run') || normalizedSport.includes('бег')) {
    return { name: 'бег', gender: 'masculine' };
  }

  if (normalizedSport.includes('walk') || normalizedSport.includes('ход')) {
    return { name: 'ходьба', gender: 'feminine' };
  }

  if (
    normalizedSport.includes('ride') ||
    normalizedSport.includes('bike') ||
    normalizedSport.includes('cycl') ||
    normalizedSport.includes('вел')
  ) {
    return { name: 'велозаезд', gender: 'masculine' };
  }

  if (normalizedSport.includes('swim') || normalizedSport.includes('плав')) {
    return { name: 'плавание', gender: 'neuter' };
  }

  if (normalizedSport.includes('yoga') || normalizedSport.includes('йог')) {
    return { name: 'йога', gender: 'feminine' };
  }

  if (normalizedSport.includes('hike') || normalizedSport.includes('trek') || normalizedSport.includes('поход')) {
    return { name: 'поход', gender: 'masculine' };
  }

  if (normalizedSport.includes('ski') || normalizedSport.includes('лыж')) {
    return { name: 'лыжная прогулка', gender: 'feminine' };
  }

  return { name: 'тренировка', gender: 'feminine' };
}

function getActivityHour(date?: Date | string, timeZone = DEFAULT_TIME_ZONE) {
  if (!date) return getLocalDateTimeParts(new Date(), timeZone).hour;

  const parsedDate = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsedDate.getTime())
    ? getLocalDateTimeParts(new Date(), timeZone).hour
    : getLocalDateTimeParts(parsedDate, timeZone).hour;
}

export function generateActivityTitle(sport: string, date?: Date | string, timeZone = DEFAULT_TIME_ZONE) {
  const hour = getActivityHour(date, timeZone);
  const period = timeOfDay.find(({ untilHour }) => hour < untilHour) ?? timeOfDay[0];
  const activityName = getActivityName(sport);

  return `${period.adjectives[activityName.gender]} ${activityName.name}`;
}
