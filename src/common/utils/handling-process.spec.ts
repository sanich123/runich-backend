import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

const writeLogs = jest.fn();
jest.unstable_mockModule('./logs', () => ({ writeLogs }));

const { uncaughtErrorHandler, unhandledRejectionHandler } = await import('./handling-process');

describe('process error handlers', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.exitCode = originalExitCode;
  });

  it('records uncaught exceptions and marks the process as failed', () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const error = new Error('uncaught');

    uncaughtErrorHandler(error);

    expect(process.exitCode).toBe(1);
    expect(loggerError).toHaveBeenCalledWith('Необработанное исключение: uncaught', error.stack);
    expect(writeLogs).toHaveBeenCalledWith(expect.stringContaining('Необработанное исключение: uncaught'));
    loggerError.mockRestore();
  });

  it('records unhandled promise rejections and marks the process as failed', () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const error = new Error('rejected');

    unhandledRejectionHandler(error);

    expect(process.exitCode).toBe(1);
    expect(loggerError).toHaveBeenCalledWith('Необработанная ошибка Promise: rejected', error.stack);
    expect(writeLogs).toHaveBeenCalledWith(expect.stringContaining('Необработанная ошибка Promise: rejected'));
    loggerError.mockRestore();
  });
});
