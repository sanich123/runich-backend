import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

const DEFAULT_PAGE = 0;
const DEFAULT_SIZE = 10;
const MAX_SIZE = 100;

export interface Pagination {
  page: number;
  limit: number;
  size: number;
  offset: number;
}

function parseQueryInteger(value: unknown, fallback: number, field: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(`Invalid pagination ${field}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`Invalid pagination ${field}`);
  }

  return parsed;
}

export function parsePagination(query: Request['query']): Pagination {
  const page = parseQueryInteger(query.page, DEFAULT_PAGE, 'page');
  const size = parseQueryInteger(query.size, DEFAULT_SIZE, 'size');

  if (size === 0) throw new BadRequestException('Invalid pagination size');
  if (size > MAX_SIZE) throw new BadRequestException(`Invalid pagination params: Max size is ${MAX_SIZE}`);

  const limit = size;
  const offset = page * limit;
  if (!Number.isSafeInteger(offset)) throw new BadRequestException('Invalid pagination offset');
  return { page, limit, size, offset };
}

export const PaginationParams = createParamDecorator((_data, ctx: ExecutionContext): Pagination => {
  const req: Request = ctx.switchToHttp().getRequest();
  return parsePagination(req.query);
});
