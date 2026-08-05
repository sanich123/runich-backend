export function getSpeedInMinsInKm(distance: number, time: number) {
  let paceAsString, paceAsNumber;
  if (distance && time) {
    const metersInKilometer = 1000;
    const millisecondsInSecond = 1000;
    const totalSeconds = time / millisecondsInSecond;
    const totalKilometres = distance / metersInKilometer;
    const paceInSecs = totalSeconds / totalKilometres;
    const wholeMinutes = Math.trunc(paceInSecs / 60);
    const restSeconds = Math.round(paceInSecs - wholeMinutes * 60);
    const modifiedSeconds = restSeconds < 10 ? `0${restSeconds}` : `${restSeconds}`;
    paceAsString = `${wholeMinutes}.${modifiedSeconds}`;
    paceAsNumber = Number(paceAsString);
  } else {
    paceAsString = '0.00';
    paceAsNumber = 0;
  }
  return { paceAsNumber, paceAsString };
}
