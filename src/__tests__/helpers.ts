import { InternalServerErrorException } from '@nestjs/common';
import { jest } from '@jest/globals';

export function asyncMock() {
  return jest.fn<() => Promise<unknown>>();
}

export function syncMock() {
  return jest.fn<() => unknown>();
}

export async function expectInternalServerError(operation: Promise<unknown>) {
  await expect(operation).rejects.toBeInstanceOf(InternalServerErrorException);
}

export function rejectWithDatabaseError(message = 'database unavailable') {
  return Promise.reject(new Error(message));
}
