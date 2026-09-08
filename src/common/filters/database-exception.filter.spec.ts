import { HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import { DatabaseErrors } from 'src/infrastructure/database/prisma/database-test-errors';
import { DatabaseExceptionFilter } from './database-exception.filter';

describe('DatabaseExceptionFilter', () => {
  it('uses a configured status and safe message', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    const exception = new DatabaseErrors.SqlQueryError('duplicate', { code: 'P2002' });
    const filter = new DatabaseExceptionFilter({ P2002: HttpStatus.CONFLICT });

    filter.catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'Такая запись уже существует',
    });
  });

  it('falls back to internal server error for unknown database codes', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    const exception = new DatabaseErrors.SqlQueryError('unknown', { code: 'P9999' });

    new DatabaseExceptionFilter().catch(exception, host as never);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ошибка запроса к базе данных',
    });
  });
});
