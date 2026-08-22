import { BadRequestException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from 'src/infrastructure/database/generated/prisma/client';
import { PrismaException } from 'src/common/filters/prisma-exceptions';
import { handleServiceError, isPrismaUniqueConstraintError } from './prisma-errors';

describe('handleServiceError', () => {
  let loggerError: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes the database error details and hides unexpected errors behind HTTP 500', () => {
    const error = new Error('database unavailable');

    expect(() => handleServiceError(error)).toThrow(InternalServerErrorException);
    expect(loggerError).toHaveBeenCalledWith(
      'Неожиданная ошибка при выполнении операции',
      expect.objectContaining({ name: 'Error', message: 'database unavailable', stack: error.stack }),
    );
  });

  it('writes non-Error database failures without assuming an Error shape', () => {
    expect(() => handleServiceError('connection closed')).toThrow(InternalServerErrorException);
    expect(loggerError).toHaveBeenCalledWith('Неожиданная ошибка при выполнении операции', 'connection closed');
  });

  it('maps known Prisma errors after logging them', () => {
    const error = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(() => handleServiceError(error)).toThrow(PrismaException);
    expect(loggerError).toHaveBeenCalledWith(
      'Ошибка запроса к базе данных (P2002)',
      expect.objectContaining({ name: error.name, message: error.message, stack: error.stack }),
    );
    let thrown: unknown;
    try {
      handleServiceError(error);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(PrismaException);
    expect((thrown as PrismaException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect((thrown as PrismaException).getResponse()).toBe('Такая запись уже существует');
  });

  it('does not log application-level HTTP exceptions as database errors', () => {
    const error = new BadRequestException('invalid input');

    expect(() => handleServiceError(error)).toThrow(error);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('recognizes only Prisma unique constraint errors', () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const otherError = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    expect(isPrismaUniqueConstraintError(uniqueError)).toBe(true);
    expect(isPrismaUniqueConstraintError(otherError)).toBe(false);
    expect(isPrismaUniqueConstraintError(new Error('unique constraint'))).toBe(false);
  });

  it('maps unknown and validation Prisma errors to internal server errors', () => {
    const unknownError = new Prisma.PrismaClientUnknownRequestError('unknown', { clientVersion: 'test' });
    const validationError = new Prisma.PrismaClientValidationError('validation', { clientVersion: 'test' });

    expect(() => handleServiceError(unknownError)).toThrow(PrismaException);
    expect(() => handleServiceError(validationError)).toThrow(PrismaException);
    expect(loggerError).toHaveBeenCalledWith('Ошибка клиента базы данных', expect.anything());
  });
});
