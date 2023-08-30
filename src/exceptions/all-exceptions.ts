import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { writeLogs } from 'src/utils/logs';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) { }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    let message, statusCode;

    if (exception instanceof HttpException) {
      message = exception.message;
      statusCode = exception.getStatus();
    } else {
      message = 'Internal Server Error';
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const responseBody = {
      message,
      statusCode,
      date: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };
    writeLogs(JSON.stringify(responseBody));
    this.logger.error(responseBody);

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
