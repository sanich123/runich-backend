import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { writeLogs } from 'src/common/utils/logs';

type ExceptionResponse = string | { message?: unknown };

const defaultMessages: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Некорректный запрос',
  [HttpStatus.UNAUTHORIZED]: 'Требуется авторизация',
  [HttpStatus.FORBIDDEN]: 'Доступ запрещён',
  [HttpStatus.NOT_FOUND]: 'Ресурс не найден',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'Метод не поддерживается',
  [HttpStatus.CONFLICT]: 'Конфликт данных',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Размер запроса слишком большой',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Данные не прошли проверку',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Внутренняя ошибка сервера',
};

const translatedMessages: Record<string, string> = {
  'Bad Request': 'Некорректный запрос',
  'Bad Request Exception': 'Некорректный запрос',
  Unauthorized: 'Требуется авторизация',
  UnauthorizedException: 'Требуется авторизация',
  Forbidden: 'Доступ запрещён',
  'Forbidden Exception': 'Доступ запрещён',
  'Not Found': 'Ресурс не найден',
  'Not Found Exception': 'Ресурс не найден',
  Conflict: 'Конфликт данных',
  'Conflict Exception': 'Конфликт данных',
  'Internal Server Error': 'Внутренняя ошибка сервера',
  'Internal server error': 'Внутренняя ошибка сервера',
};

function translateMessage(message: string, statusCode: number) {
  return translatedMessages[message] ?? defaultMessages[statusCode] ?? message;
}

function getHttpExceptionMessage(exception: HttpException): string | string[] {
  const response = exception.getResponse() as ExceptionResponse;
  const responseMessage = typeof response === 'string' ? response : response?.message;

  if (Array.isArray(responseMessage)) {
    return responseMessage.map((message) =>
      typeof message === 'string' ? translateMessage(message, exception.getStatus()) : 'Некорректное значение',
    );
  }

  if (typeof responseMessage === 'string') return translateMessage(responseMessage, exception.getStatus());
  return translateMessage(exception.message, exception.getStatus());
}

function getUnknownExceptionStatus(exception: unknown) {
  if (!exception || typeof exception !== 'object') return HttpStatus.INTERNAL_SERVER_ERROR;

  const status = (exception as { status?: unknown; statusCode?: unknown }).status;
  const statusCode = (exception as { statusCode?: unknown }).statusCode;
  const candidate = typeof status === 'number' ? status : statusCode;
  return typeof candidate === 'number' && candidate >= 400 && candidate < 600
    ? candidate
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

function getUnknownExceptionMessage(exception: unknown, statusCode: number) {
  if (
    statusCode === HttpStatus.BAD_REQUEST &&
    exception &&
    typeof exception === 'object' &&
    (exception as { type?: unknown }).type === 'entity.parse.failed'
  ) {
    return 'Некорректный JSON в теле запроса';
  }

  return defaultMessages[statusCode] ?? 'Внутренняя ошибка сервера';
}

function isCreateActivityRequest(request: Request) {
  const path = (request.originalUrl ?? request.url).split('?')[0];
  return request.method === 'POST' && /^\/activity\/[^/]+\/?$/.test(path);
}

function serializeRequestBody(body: unknown) {
  if (body === undefined) return 'тело запроса отсутствует';

  try {
    const serializedBody = JSON.stringify(body);
    return serializedBody?.replace(/([?&]access_token=)[^&"]+/gi, '$1[скрыт]') ?? 'тело запроса отсутствует';
  } catch {
    return 'не удалось сериализовать тело запроса';
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    let message: string | string[], statusCode: number;

    if (exception instanceof HttpException) {
      message = getHttpExceptionMessage(exception);
      statusCode = exception.getStatus();
    } else {
      statusCode = getUnknownExceptionStatus(exception);
      message = getUnknownExceptionMessage(exception, statusCode);
    }

    const responseBody = {
      message,
      statusCode,
      date: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };
    const errorDetails = exception instanceof Error ? exception.stack : String(exception);
    const request = ctx.getRequest<Request>();
    const activityRequestDetails =
      isCreateActivityRequest(request) && statusCode >= HttpStatus.BAD_REQUEST
        ? `; Данные создания активности: ${serializeRequestBody(request.body)}`
        : '';
    const logMessage = `${statusCode} ${responseBody.path}: ${JSON.stringify(message)}${activityRequestDetails}`;
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMessage, errorDetails);
    } else {
      this.logger.warn(logMessage);
    }
    await writeLogs(JSON.stringify({ ...responseBody, error: errorDetails }));

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
