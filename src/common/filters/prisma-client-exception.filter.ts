import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '../../infrastructure/database/generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  constructor(private readonly errorMap: Record<string, number> = {}) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = this.errorMap[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(`Ошибка запроса к базе данных (${exception.code})`, exception.stack);

    response.status(status).json({
      statusCode: status,
      message: this.getSafeMessage(exception.code),
    });
  }

  private getSafeMessage(code: string) {
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
}
