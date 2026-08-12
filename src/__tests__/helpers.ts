import { InternalServerErrorException, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

export function asyncMock() {
  return jest.fn<() => Promise<unknown>>();
}

export function syncMock() {
  return jest.fn<() => unknown>();
}

export async function expectInternalServerError(operation: Promise<unknown>) {
  const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  try {
    await expect(operation).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(loggerError).toHaveBeenCalledWith('Ошибка операции с базой данных', expect.anything());
  } finally {
    loggerError.mockRestore();
  }
}

export function rejectWithDatabaseError(message = 'database unavailable') {
  return Promise.reject(new Error(message));
}
