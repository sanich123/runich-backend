export function makeActivityTotals() {
  return { totalDuration: 300, totalDistance: 3000, totalItems: 2 };
}

export function makeEmptyActivityTotals() {
  return { totalDuration: 0, totalDistance: 0, totalItems: 0 };
}

export function makeSportActivityTotals(sport: 'run' | 'bike') {
  return sport === 'run'
    ? { sport, totalDuration: 100, totalDistance: 1000, totalItems: 1 }
    : { sport, totalDuration: 200, totalDistance: 2000, totalItems: 1 };
}

export function makeStatisticActivities() {
  return [
    { duration: 100, distance: 1000, speed: 5, date: new Date('2025-01-02'), id: 'a1', sport: 'run' },
    { duration: 200, distance: 2000, speed: 6, date: new Date('2025-01-03'), id: 'a2', sport: 'bike' },
  ];
}
