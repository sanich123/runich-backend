import { BadRequestException } from '@nestjs/common';

export function validateOptionalIntegerQuery(
  value: unknown,
  field: string,
  { min = 0, max }: { min?: number; max?: number } = {},
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(`Invalid ${field}`);
  }

  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < min || (max !== undefined && numberValue > max)) {
    throw new BadRequestException(`Invalid ${field}`);
  }

  return value;
}

export function validateOptionalDateQuery(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`Invalid ${field}`);
  }

  return value;
}
