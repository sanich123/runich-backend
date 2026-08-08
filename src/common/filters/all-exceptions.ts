import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { writeLogs } from 'src/common/utils/logs';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
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
    const errorDetails = exception instanceof Error ? exception.stack : String(exception);
    const logMessage = `${statusCode} ${responseBody.path}: ${message}`;
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMessage, errorDetails);
    } else {
      this.logger.warn(logMessage);
    }
    await writeLogs(JSON.stringify({ ...responseBody, error: errorDetails }));

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
