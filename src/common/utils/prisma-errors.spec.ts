import { BadRequestException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from 'src/infrastructure/database/generated/prisma/client';
import { PrismaException } from 'src/common/filters/prisma-exceptions';
import { prismaErrorHandling } from './prisma-errors';

describe('prismaErrorHandling', () => {
  let loggerError: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes the database error details and hides unexpected errors behind HTTP 500', () => {
    const error = new Error('database unavailable');

    expect(() => prismaErrorHandling(error)).toThrow(InternalServerErrorException);
    expect(loggerError).toHaveBeenCalledWith(
      'Database operation failed',
      expect.objectContaining({ name: 'Error', message: 'database unavailable', stack: error.stack }),
    );
  });

  it('writes non-Error database failures without assuming an Error shape', () => {
    expect(() => prismaErrorHandling('connection closed')).toThrow(InternalServerErrorException);
    expect(loggerError).toHaveBeenCalledWith('Database operation failed', 'connection closed');
  });

  it('maps known Prisma errors after logging them', () => {
    const error = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(() => prismaErrorHandling(error)).toThrow(PrismaException);
    expect(loggerError).toHaveBeenCalledWith(
      'Database operation failed',
      expect.objectContaining({ name: error.name, message: error.message, stack: error.stack }),
    );
    let thrown: unknown;
    try {
      prismaErrorHandling(error);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(PrismaException);
    expect((thrown as PrismaException).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('does not log application-level HTTP exceptions as database errors', () => {
    const error = new BadRequestException('invalid input');

    expect(() => prismaErrorHandling(error)).toThrow(error);
    expect(loggerError).not.toHaveBeenCalled();
  });
});
