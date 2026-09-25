const MIN_REASONABLE_WEIGHT_KG = 20;
const MAX_REASONABLE_WEIGHT_KG = 200;
const MILLISECONDS_IN_HOUR = 60 * 60 * 1000;

type ActivityCaloriesInput = {
  weight?: string | number | null;
  height?: string | number | null;
  age?: string | number | null;
  gender?: string | null;
  sport: string;
  distance: number;
  duration: number;
};

/**
 * Calculates active calories with a standard MET estimate.
 * The result is intentionally null when the profile does not contain the metrics required by the estimate.
 */
export function calculateActiveCalories({
  weight,
  height,
  age,
  gender,
  sport,
  distance,
  duration,
}: ActivityCaloriesInput) {
  const weightKg = parseWeight(weight);
  const heightCm = parseNumberInRange(height, 100, 230);
  const ageYears = parseNumberInRange(age, 13, 100);
  const genderConstant = getGenderConstant(gender);
  if (
    weightKg === null ||
    heightCm === null ||
    ageYears === null ||
    genderConstant === null ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  const durationMinutes = duration / 60_000;
  const speedKmh = distance / 1000 / (duration / MILLISECONDS_IN_HOUR);
  const met = getActivityMet(sport, speedKmh);
  const basalMetabolicRate = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + genderConstant;
  const calories = (basalMetabolicRate / 1440) * (met - 1) * durationMinutes;

  return Number.isFinite(calories) ? Math.max(0, Math.round(calories)) : null;
}

function parseWeight(weight: string | number | null | undefined) {
  return parseNumberInRange(weight, MIN_REASONABLE_WEIGHT_KG, MAX_REASONABLE_WEIGHT_KG);
}

function parseNumberInRange(value: string | number | null | undefined, min: number, max: number) {
  const numericValue = typeof value === 'number' ? value : Number(value?.replace(',', '.').trim());
  if (!Number.isFinite(numericValue) || numericValue < min || numericValue > max) return null;
  return numericValue;
}

function getGenderConstant(gender: string | null | undefined) {
  const normalizedGender = gender?.trim().toLocaleLowerCase();
  if (normalizedGender === 'male' || normalizedGender === 'мужчина') return 5;
  if (normalizedGender === 'female' || normalizedGender === 'женщина') return -161;
  return null;
}

function getActivityMet(sport: string, speedKmh: number) {
  const normalizedSport = sport.trim().toLocaleLowerCase();

  if (normalizedSport.includes('run') || normalizedSport.includes('бег')) return getRunningMet(speedKmh);
  if (normalizedSport.includes('walk') || normalizedSport.includes('ход')) return getWalkingMet(speedKmh);
  if (
    normalizedSport.includes('ride') ||
    normalizedSport.includes('bike') ||
    normalizedSport.includes('cycl') ||
    normalizedSport.includes('вел')
  ) {
    return getCyclingMet(speedKmh);
  }
  if (normalizedSport.includes('swim') || normalizedSport.includes('плав')) return 8;
  if (normalizedSport.includes('hike') || normalizedSport.includes('trek') || normalizedSport.includes('поход'))
    return 6;
  if (normalizedSport.includes('yoga') || normalizedSport.includes('йог')) return 3;
  if (normalizedSport.includes('workout') || normalizedSport.includes('трен')) return 5;

  return 5;
}

function getRunningMet(speedKmh: number) {
  if (speedKmh < 6.4) return 6;
  if (speedKmh < 8) return 8.3;
  if (speedKmh < 9.7) return 9.8;
  if (speedKmh < 11.3) return 11;
  if (speedKmh < 12.9) return 11.8;
  if (speedKmh < 14.5) return 12.8;
  return 14.5;
}

function getWalkingMet(speedKmh: number) {
  if (speedKmh < 3.2) return 2.8;
  if (speedKmh < 4.8) return 3.5;
  if (speedKmh < 5.6) return 4.3;
  if (speedKmh < 6.4) return 5;
  return 6.3;
}

function getCyclingMet(speedKmh: number) {
  if (speedKmh < 16) return 4;
  if (speedKmh < 19) return 6.8;
  if (speedKmh < 22) return 8;
  if (speedKmh < 25) return 10;
  return 12;
}
