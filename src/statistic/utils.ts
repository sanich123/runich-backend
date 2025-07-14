export enum YearCategoryProps {
  all = 'all',
  totalDuration = 'totalDuration',
  totalDistance = 'totalDistance',
  totalItems = 'totalItems',
}

export function reduceAllMetricsToYearCategoryMonths(
  acc: object,
  { date, duration, distance, sport }: { date: Date; duration: number; distance: number; sport: string },
) {
  const { all, totalDuration, totalDistance, totalItems } = YearCategoryProps;
  const newDate = new Date(date);
  const year = newDate.getFullYear();
  const month = newDate.getMonth();
  const durationInHours = duration / 3600000;
  const distanceInKm = distance / 1000;

  if (!acc[year]) {
    acc[year] = {};
  }
  if (!acc[year][all]) {
    acc[year][all] = {};
  }
  if (!acc[year][all][month]) {
    acc[year][all][month] = {};
  }
  if (!acc[year][sport]) {
    acc[year][sport] = {};
  }
  if (!acc[year][sport][month]) {
    acc[year][sport][month] = {};
  }

  if (!acc[year][all][month][totalDuration]) {
    acc[year][all][month][totalDuration] = durationInHours;
  } else {
    acc[year][all][month][totalDuration] += durationInHours;
  }
  if (!acc[year][all][month][totalDistance]) {
    acc[year][all][month][totalDistance] = distanceInKm;
  } else {
    acc[year][all][month][totalDistance] += distanceInKm;
  }
  if (!acc[year][all][month][totalItems]) {
    acc[year][all][month][totalItems] = 1;
  } else {
    acc[year][all][month][totalItems] += 1;
  }
  if (!acc[year][all][totalDuration]) {
    acc[year][all][totalDuration] = durationInHours;
  } else {
    acc[year][all][totalDuration] += durationInHours;
  }
  if (!acc[year][all][totalDistance]) {
    acc[year][all][totalDistance] = distanceInKm;
  } else {
    acc[year][all][totalDistance] += distanceInKm;
  }
  if (!acc[year][all][totalItems]) {
    acc[year][all][totalItems] = 1;
  } else {
    acc[year][all][totalItems] += 1;
  }

  if (!acc[year][sport][totalDuration]) {
    acc[year][sport][totalDuration] = durationInHours;
  } else {
    acc[year][sport][totalDuration] += durationInHours;
  }
  if (!acc[year][sport][totalDistance]) {
    acc[year][sport][totalDistance] = distanceInKm;
  } else {
    acc[year][sport][totalDistance] += distanceInKm;
  }
  if (!acc[year][sport][totalItems]) {
    acc[year][sport][totalItems] = 1;
  } else {
    acc[year][sport][totalItems] += 1;
  }

  if (!acc[year][sport][month][totalDuration]) {
    acc[year][sport][month][totalDuration] = durationInHours;
  } else {
    acc[year][sport][month][totalDuration] += durationInHours;
  }

  if (!acc[year][sport][month][totalDistance]) {
    acc[year][sport][month][totalDistance] = distanceInKm;
  } else {
    acc[year][sport][month][totalDistance] += distanceInKm;
  }
  if (!acc[year][sport][month][totalItems]) {
    acc[year][sport][month][totalItems] = 1;
  } else {
    acc[year][sport][month][totalItems] += 1;
  }
  return acc;
}
