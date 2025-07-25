import { HttpException, InternalServerErrorException } from '@nestjs/common';
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';
import { PrismaException } from 'src/exceptions/prisma-exceptions';
import { prismaError } from 'prisma-better-errors';

export function prismaErrorHandling(error: unknown) {
  if (error instanceof HttpException) {
    throw error;
  }
  if (error instanceof PrismaClientKnownRequestError) {
    throw new prismaError(error);
  }
  if (error instanceof PrismaClientUnknownRequestError || error instanceof PrismaClientValidationError) {
    throw new PrismaException(error.message);
  }
  throw new InternalServerErrorException(JSON.stringify(error, null, 2).slice(0, 150));
}
