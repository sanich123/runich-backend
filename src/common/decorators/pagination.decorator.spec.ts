import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { parsePagination } from './pagination.decorator';

function readPagination(query: Record<string, unknown>) {
  return parsePagination(query as Request['query']);
}

describe('PaginationParams', () => {
  it('uses defaults and calculates limit and offset for valid values', () => {
    expect(readPagination({})).toEqual({ page: 0, limit: 10, size: 10, offset: 0 });
    expect(readPagination({ page: '2', size: '25' })).toEqual({ page: 2, limit: 25, size: 25, offset: 50 });
    expect(readPagination({ page: '0', size: '1' })).toEqual({ page: 0, limit: 1, size: 1, offset: 0 });
    expect(readPagination({ page: '100000', size: '100' })).toEqual({
      page: 100000,
      limit: 100,
      size: 100,
      offset: 10_000_000,
    });
  });

  it.each([
    { page: '-1' },
    { page: '1.5' },
    { page: '1abc' },
    { page: '' },
    { page: ['1', '2'] },
    { size: '-1' },
    { size: '0' },
    { size: '1.5' },
    { size: '1abc' },
    { size: '' },
    { size: ['10', '20'] },
    { size: '101' },
    { page: Number.MAX_SAFE_INTEGER.toString() + '0' },
    { page: Number.MAX_SAFE_INTEGER.toString(), size: '2' },
  ])('rejects invalid pagination query %#', (query) => {
    expect(() => readPagination(query)).toThrow(BadRequestException);
  });
});
