import { HttpException, HttpStatus } from '@nestjs/common';
import { PRISMA_ERR_TO_HTTP_CODES } from 'src/common/constants';

export class PrismaException extends HttpException {
  constructor(message: string, code?: string) {
    const status = code ? PRISMA_ERR_TO_HTTP_CODES[code as keyof typeof PRISMA_ERR_TO_HTTP_CODES] : undefined;
    super(code ? getPrismaMessage(code) : message, status ?? HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

function getPrismaMessage(code: string) {
  switch (code) {
    case 'P2000':
      return 'Переданное значение слишком длинное';
    case 'P2002':
      return 'Такая запись уже существует';
    case 'P2025':
      return 'Запись не найдена';
    default:
      return 'Ошибка запроса к базе данных';
  }
}
