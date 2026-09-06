import { randomInt } from 'node:crypto';

export function getTimeStampFromTime(date: Date) {
  return new Date(date).getTime() / 1000;
}

export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return randomInt(min, max + 1);
}
