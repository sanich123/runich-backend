import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface Filtering {
  name?: string | null;
  email?: string | null;
  surname?: string | null;
}

export const FilteringParams = createParamDecorator((data: unknown, ctx: ExecutionContext): Filtering => {
  const req: Request = ctx.switchToHttp().getRequest();

  if (!Array.isArray(data)) throw new BadRequestException('Invalid filter parameter');

  const allowedFields = new Set(data.filter((field): field is string => typeof field === 'string'));
  const filteredObj: Filtering = {};

  for (const [key, value] of Object.entries(req.query)) {
    if (!allowedFields.has(key)) continue;
    if (typeof value !== 'string') throw new BadRequestException(`Invalid filter value for ${key}`);

    filteredObj[key as keyof Filtering] = value;
  }

  return filteredObj;
});
