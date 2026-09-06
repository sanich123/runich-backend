import { HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma } from '../../infrastructure/database/generated/prisma/client';
import { PrismaException } from 'src/common/filters/prisma-exceptions';

const logger = new Logger('Prisma');

export function isPrismaUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function handleServiceError(error: unknown) {
  // Service methods currently use broad try/catch blocks. Keep application-level
  // HTTP exceptions intact and only translate errors that Prisma identifies.
  if (error instanceof HttpException) {
    throw error;
  }

  const errorDetails =
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`Ошибка запроса к базе данных (${error.code})`, errorDetails);
    throw new PrismaException('Ошибка операции с базой данных', error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientValidationError) {
    logger.error('Ошибка клиента базы данных', errorDetails);
    throw new PrismaException('Ошибка операции с базой данных');
  }

  // This helper is called from legacy broad catches, so non-Prisma failures can
  // still arrive here. Do not describe them as database failures in logs.
  logger.error('Неожиданная ошибка при выполнении операции', errorDetails);
  throw new InternalServerErrorException('Внутренняя ошибка сервера');
}
