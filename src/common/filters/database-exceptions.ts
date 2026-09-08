import { HttpException, HttpStatus } from '@nestjs/common';
import { DATABASE_ERROR_TO_HTTP_STATUS } from 'src/common/constants';

export class DatabaseException extends HttpException {
  constructor(message: string, code?: string) {
    const status = code ? DATABASE_ERROR_TO_HTTP_STATUS[code as keyof typeof DATABASE_ERROR_TO_HTTP_STATUS] : undefined;
    super(code ? getDatabaseMessage(code) : message, status ?? HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export function getDatabaseMessage(code: string) {
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
