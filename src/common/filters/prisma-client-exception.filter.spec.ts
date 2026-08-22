import { HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from 'src/infrastructure/database/generated/prisma/client';
import { PrismaClientExceptionFilter } from './prisma-client-exception.filter';

describe('PrismaClientExceptionFilter', () => {
  it('uses a configured status and safe message', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    const exception = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const filter = new PrismaClientExceptionFilter({ P2002: HttpStatus.CONFLICT });

    filter.catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'Такая запись уже существует',
    });
  });

  it('falls back to internal server error for unknown Prisma codes', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    const exception = new Prisma.PrismaClientKnownRequestError('unknown', {
      code: 'P9999',
      clientVersion: 'test',
    });

    new PrismaClientExceptionFilter().catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ошибка запроса к базе данных',
    });
  });
});
