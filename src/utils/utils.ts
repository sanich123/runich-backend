import { ForbiddenException, NotFoundException } from '@nestjs/common';

export function getTimeStampFromTime(date: Date) {
  return new Date(date).getTime() / 1000;
}

export function throwNotFoundException(message: string) {
  throw new NotFoundException(message);
}

export function throwForbiddenException(message: string) {
  throw new ForbiddenException(message);
}
