import { HttpException } from '@nestjs/common';
import { PRISMA_ERR_TO_HTTP_CODES } from 'src/utils/const';

export class PrismaException extends HttpException {
  constructor(message: string, code?: string) {
    super(`Error in a database: ${message}`, PRISMA_ERR_TO_HTTP_CODES[code]);
  }
}
