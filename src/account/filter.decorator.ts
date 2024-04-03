import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface Filtering {
  name?: string | null;
  email?: string | null;
  birthday?: Date | string | null;
  city?: string | null;
  gender?: string | null;
  profilePhoto?: string | null;
  sport?: string | null;
  surname?: string | null;
}

export const FilteringParams = createParamDecorator((data, ctx: ExecutionContext): Filtering => {
    const req: Request = ctx.switchToHttp().getRequest();
    const filterDto = req.query;
    if (!filterDto) return null;

    if (typeof filterDto != 'object') throw new BadRequestException('Invalid filter parameter');
    
    if (typeof data != 'object') throw new BadRequestException('Invalid filter parameter');
    
    const filteredObj = Object.fromEntries(
      Object.entries(filterDto).filter(([key]) => data.includes(key))
    );

    return filteredObj;
});
