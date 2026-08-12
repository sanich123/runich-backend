import { HttpException, HttpStatus } from '@nestjs/common';
import { PRISMA_ERR_TO_HTTP_CODES } from 'src/common/constants';

export class PrismaException extends HttpException {
  constructor(message: string, code?: string) {
    const status = code ? PRISMA_ERR_TO_HTTP_CODES[code as keyof typeof PRISMA_ERR_TO_HTTP_CODES] : undefined;
    super(message, status ?? HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
