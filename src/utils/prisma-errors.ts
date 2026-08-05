import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaException } from 'src/exceptions/prisma-exceptions';
import { prismaError } from 'prisma-better-errors';

export function prismaErrorHandling(error: unknown) {
  if (error instanceof HttpException) {
    throw error;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new prismaError(error);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientValidationError) {
    throw new PrismaException(error.message);
  }
  console.error('[Prisma] Unhandled database error', error);
  throw new InternalServerErrorException(JSON.stringify(error, null, 2).slice(0, 150));
}
