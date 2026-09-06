import { HttpStatus } from '@nestjs/common';
import { PrismaException } from './prisma-exceptions';

describe('PrismaException', () => {
  it.each([
    ['P2000', HttpStatus.BAD_REQUEST, 'Переданное значение слишком длинное'],
    ['P2002', HttpStatus.CONFLICT, 'Такая запись уже существует'],
    ['P2025', HttpStatus.NOT_FOUND, 'Запись не найдена'],
    ['P9999', HttpStatus.INTERNAL_SERVER_ERROR, 'Ошибка запроса к базе данных'],
  ])('maps %s to a safe HTTP response', (code, status, message) => {
    const exception = new PrismaException('internal details', code);

    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toBe(message);
  });

  it('keeps the supplied message when no Prisma code exists', () => {
    const exception = new PrismaException('custom failure');

    expect(exception.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(exception.getResponse()).toBe('custom failure');
  });
});
