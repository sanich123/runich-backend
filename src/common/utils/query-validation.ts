import { BadRequestException } from '@nestjs/common';
import { isValidIanaTimeZone } from './time-zone';

export function validateOptionalIntegerQuery(
  value: unknown,
  field: string,
  { min = 0, max }: { min?: number; max?: number } = {},
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(`Некорректное значение свойства: ${field}`);
  }

  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < min || (max !== undefined && numberValue > max)) {
    throw new BadRequestException(`Некорректное значение свойства: ${field}`);
  }

  return value;
}

export function validateOptionalDateQuery(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`Некорректная дата в свойстве: ${field}`);
  }

  return value;
}

export function validateOptionalIanaTimeZoneQuery(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isValidIanaTimeZone(value)) {
    throw new BadRequestException(`Некорректный часовой пояс в свойстве: ${field}`);
  }

  return value;
}
