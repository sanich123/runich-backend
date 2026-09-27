import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

const DEFAULT_PAGE = 0;
const DEFAULT_SIZE = 10;
const MAX_SIZE = 100;

interface Pagination {
  page: number;
  limit: number;
  size: number;
  offset: number;
}

function parseQueryInteger(value: unknown, fallback: number, field: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(`Некорректное значение параметра пагинации: ${field}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`Некорректное значение параметра пагинации: ${field}`);
  }

  return parsed;
}

export function parsePagination(query: Request['query']): Pagination {
  const page = parseQueryInteger(query.page, DEFAULT_PAGE, 'page');
  const size = parseQueryInteger(query.size, DEFAULT_SIZE, 'size');

  if (size === 0) throw new BadRequestException('Размер страницы должен быть больше нуля: size');
  if (size > MAX_SIZE) throw new BadRequestException(`Размер страницы не может быть больше ${MAX_SIZE}: size`);

  const limit = size;
  const offset = page * limit;
  if (!Number.isSafeInteger(offset)) throw new BadRequestException('Некорректное смещение пагинации: offset');
  return { page, limit, size, offset };
}
