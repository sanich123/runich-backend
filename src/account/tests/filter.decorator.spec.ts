import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { parseFiltering } from '../filter.decorator';

function readFilter(data: unknown, query: Record<string, unknown>) {
  return parseFiltering(data, query as Request['query']);
}

describe('FilteringParams', () => {
  it('keeps only configured string fields and supports an empty filter', () => {
    expect(readFilter(['name', 'email', 'surname'], {})).toEqual({});
    expect(
      readFilter(['name', 'email', 'surname'], {
        name: ' Ann ',
        email: 'ann@example.com',
        surname: 'Runner',
        ignored: 'value',
      }),
    ).toEqual({ name: ' Ann ', email: 'ann@example.com', surname: 'Runner' });
  });

  it('rejects invalid decorator configuration and non-string filter values', () => {
    expect(() => readFilter(undefined, {})).toThrow(BadRequestException);
    expect(() => readFilter('name', {})).toThrow(BadRequestException);
    expect(() => readFilter(['name'], { name: ['Ann', 'Bob'] })).toThrow(BadRequestException);
    expect(() => readFilter(['name'], { name: { value: 'Ann' } })).toThrow(BadRequestException);
  });
});
