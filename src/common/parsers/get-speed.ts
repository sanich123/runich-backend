export function getSpeedInMinsInKm(distance: number, time: number) {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(time) || time <= 0) {
    return { paceAsNumber: 0, paceAsString: '0.00' };
  }

  const secondsPerKilometer = Math.round(time / 1000 / (distance / 1000));
  const wholeMinutes = Math.floor(secondsPerKilometer / 60);
  const restSeconds = secondsPerKilometer % 60;
  const modifiedSeconds = restSeconds.toString().padStart(2, '0');
  const paceAsString = `${wholeMinutes}.${modifiedSeconds}`;
  const paceAsNumber = Number(paceAsString);

  return { paceAsNumber, paceAsString };
}
