import { BadRequestException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { DatabaseErrors } from 'src/infrastructure/database/prisma/database-test-errors';
import { DatabaseException } from 'src/common/filters/database-exceptions';
import { getDatabaseErrorCode, handleServiceError, isUniqueConstraintError } from '../database-errors';

describe('database errors', () => {
  let loggerError: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides unexpected errors behind HTTP 500', () => {
    const error = new Error('database unavailable');

    expect(() => handleServiceError(error)).toThrow(InternalServerErrorException);
    expect(loggerError).toHaveBeenCalledWith(
      'Неожиданная ошибка при выполнении операции',
      expect.objectContaining({ name: 'Error', message: 'database unavailable', stack: error.stack }),
    );
  });

  it('preserves application-level HTTP exceptions', () => {
    const error = new BadRequestException('invalid input');

    expect(() => handleServiceError(error)).toThrow(error);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('maps SQLSTATE unique violations to a conflict', () => {
    const error = new DatabaseErrors.SqlQueryError('unique constraint', { cause: { code: '23505' } });

    expect(getDatabaseErrorCode(error)).toBe('P2002');
    expect(() => handleServiceError(error)).toThrow(DatabaseException);
    expect(new DatabaseException('ignored', 'P2002').getStatus()).toBe(HttpStatus.CONFLICT);
    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it('recognizes database client errors without exposing internals', () => {
    const unknownError = new DatabaseErrors.DatabaseUnknownError('unknown');
    const validationError = new DatabaseErrors.DatabaseValidationError('validation');

    expect(() => handleServiceError(unknownError)).toThrow(DatabaseException);
    expect(() => handleServiceError(validationError)).toThrow(DatabaseException);
    expect(loggerError).toHaveBeenCalledWith('Ошибка клиента базы данных', expect.anything());
  });
});
