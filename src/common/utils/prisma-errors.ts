import { HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma } from '../../infrastructure/database/generated/prisma/client';
import { PrismaException } from 'src/common/filters/prisma-exceptions';

const logger = new Logger('Prisma');

export function prismaErrorHandling(error: unknown) {
  if (error instanceof HttpException) {
    throw error;
  }

  const errorDetails =
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
  logger.error('Ошибка операции с базой данных', errorDetails);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new PrismaException('Ошибка операции с базой данных', error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientValidationError) {
    throw new PrismaException('Ошибка операции с базой данных');
  }

  throw new InternalServerErrorException('Внутренняя ошибка сервера');
}
