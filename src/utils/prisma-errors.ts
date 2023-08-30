import { InternalServerErrorException } from '@nestjs/common';
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';
import { PrismaException } from 'src/exceptions/prisma-exceptions';

export function prismaErrorHandling(error: unknown) {
  if (error instanceof PrismaClientKnownRequestError) {
    throw new PrismaException(error.message, error.code);
  }
  if (error instanceof PrismaClientUnknownRequestError || error instanceof PrismaClientValidationError) {
    throw new PrismaException(error.message);
  }
  throw new InternalServerErrorException(error.toString());
}
