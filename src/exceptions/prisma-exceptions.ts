import { HttpException, HttpStatus } from '@nestjs/common';
import { PRISMA_ERR_TO_HTTP_CODES } from 'src/utils/const';

export class PrismaException extends HttpException {
  constructor(message: string, code?: string) {
    const status = code ? PRISMA_ERR_TO_HTTP_CODES[code as keyof typeof PRISMA_ERR_TO_HTTP_CODES] : undefined;
    super(`Error in a database: ${message}`, status ?? HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
