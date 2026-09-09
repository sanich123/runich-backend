import { BadRequestException } from '@nestjs/common';
import { validateOptionalDateQuery, validateOptionalIntegerQuery } from '../query-validation';

describe('query validation', () => {
  it('accepts omitted and valid integer query values', () => {
    expect(validateOptionalIntegerQuery(undefined, 'take')).toBeUndefined();
    expect(validateOptionalIntegerQuery('0', 'page')).toBe('0');
    expect(validateOptionalIntegerQuery('10', 'take', { min: 1 })).toBe('10');
    expect(validateOptionalIntegerQuery('11', 'month', { min: 0, max: 11 })).toBe('11');
  });

  it.each([undefined, null, '', '1.5', '-1', '1abc', ['1', '2'], Number.MAX_SAFE_INTEGER.toString() + '0'])(
    'rejects invalid integer query value %#',
    (value) => {
      if (value === undefined) return;
      expect(() => validateOptionalIntegerQuery(value, 'take', { min: 1, max: 100 })).toThrow(BadRequestException);
    },
  );

  it('rejects values outside configured bounds', () => {
    expect(() => validateOptionalIntegerQuery('0', 'take', { min: 1 })).toThrow(BadRequestException);
    expect(() => validateOptionalIntegerQuery('12', 'month', { min: 0, max: 11 })).toThrow(BadRequestException);
  });

  it('accepts omitted and parseable date query values', () => {
    expect(validateOptionalDateQuery(undefined, 'firstDay')).toBeUndefined();
    expect(validateOptionalDateQuery('2026-08-10T00:00:00.000Z', 'firstDay')).toBe('2026-08-10T00:00:00.000Z');
  });

  it.each([null, '', 'not-a-date', 42, ['2026-08-10']])('rejects invalid date query value %#', (value) => {
    expect(() => validateOptionalDateQuery(value, 'firstDay')).toThrow(BadRequestException);
  });
});
