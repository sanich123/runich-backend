import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { getDatabaseErrorCode } from '../utils/database-errors';
import { getDatabaseMessage } from './database-exceptions';

@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  constructor(private readonly errorMap: Record<string, number> = {}) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const code = getDatabaseErrorCode(exception);
    if (!code) throw exception;
    const response = host.switchToHttp().getResponse<Response>();
    response.locals ??= {};
    response.locals.exceptionLogged = true;
    const status = this.errorMap[code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(
      `Ошибка запроса к базе данных (${code})`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      message: getDatabaseMessage(code),
    });
  }
}
