import { BadRequestException } from '@nestjs/common';
import { canonicalizeIanaTimeZone, isValidIanaTimeZone } from './time-zone';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageSizeOverflow = 'reject' | 'clamp';

export type PageSizeOptions = {
  defaultSize?: number;
  maxSize?: number;
  overflow?: PageSizeOverflow;
  errorMessage?: string;
};

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

export function parsePageSizeQuery(value: unknown, field: string, options: PageSizeOptions = {}): string | undefined {
  const maxSize = options.maxSize ?? MAX_PAGE_SIZE;
  const overflow = options.overflow ?? 'reject';
  let validatedSize: string | undefined;

  try {
    validatedSize = validateOptionalIntegerQuery(value, field, {
      min: 1,
      ...(overflow === 'clamp' ? {} : { max: maxSize }),
    });
  } catch (error) {
    if (options.errorMessage && error instanceof BadRequestException) {
      throw new BadRequestException(options.errorMessage);
    }
    throw error;
  }

  if (validatedSize === undefined) {
    return options.defaultSize === undefined ? undefined : String(options.defaultSize);
  }
  if (overflow === 'clamp') return String(Math.min(Number(validatedSize), maxSize));
  return validatedSize;
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

  return canonicalizeIanaTimeZone(value);
}
