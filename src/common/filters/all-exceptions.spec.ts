import { BadRequestException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

const writeLogs = jest.fn();
jest.unstable_mockModule('src/common/utils/logs', () => ({ writeLogs }));

const { AllExceptionsFilter } = await import('./all-exceptions');

function createContext(request: Record<string, unknown>) {
  const response = { response: true };
  const reply = jest.fn();
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
  const httpAdapterHost = {
    httpAdapter: {
      getRequestUrl: jest.fn().mockReturnValue(request.originalUrl ?? request.url),
      reply,
    },
  };
  return { host, httpAdapterHost, response, reply };
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('translates standard HTTP exceptions and logs warnings', async () => {
    const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const context = createContext({ method: 'GET', url: '/users', params: {} });
    const filter = new AllExceptionsFilter(context.httpAdapterHost as never);

    await filter.catch(new HttpException('Bad Request', HttpStatus.BAD_REQUEST), context.host as never);

    expect(loggerWarn).toHaveBeenCalledWith('400 /users: "Некорректный запрос"');
    expect(context.reply).toHaveBeenCalledWith(
      context.response,
      expect.objectContaining({ message: 'Некорректный запрос', statusCode: 400, path: '/users' }),
      400,
    );
    expect(writeLogs).toHaveBeenCalledWith(expect.stringContaining('Некорректный запрос'));
    loggerWarn.mockRestore();
  });

  it('translates exception arrays and unknown status responses', async () => {
    const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const arrayContext = createContext({ method: 'GET', url: '/validate', params: {} });
    const filter = new AllExceptionsFilter(arrayContext.httpAdapterHost as never);

    await filter.catch(
      new HttpException({ message: ['Bad Request', 123, 'custom'] }, HttpStatus.BAD_REQUEST),
      arrayContext.host as never,
    );
    expect(arrayContext.reply).toHaveBeenCalledWith(
      arrayContext.response,
      expect.objectContaining({ message: ['Некорректный запрос', 'Некорректное значение', 'Некорректный запрос'] }),
      400,
    );

    const unknownContext = createContext({ method: 'GET', url: '/missing', params: {} });
    await new AllExceptionsFilter(unknownContext.httpAdapterHost as never).catch(
      { statusCode: HttpStatus.NOT_FOUND },
      unknownContext.host as never,
    );
    expect(unknownContext.reply).toHaveBeenCalledWith(
      unknownContext.response,
      expect.objectContaining({ message: 'Ресурс не найден', statusCode: 404 }),
      404,
    );
    loggerWarn.mockRestore();
  });

  it('handles malformed JSON and server errors with activity request diagnostics', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const request = {
      method: 'POST',
      originalUrl: '/activity/user-1?access_token=secret',
      url: '/activity/user-1',
      params: { id: 'user-1' },
      body: { link: '?access_token=secret&title=Run' },
    };
    const context = createContext(request);
    const filter = new AllExceptionsFilter(context.httpAdapterHost as never);
    const parseError = Object.assign(new Error('invalid JSON'), { type: 'entity.parse.failed' });

    await filter.catch(new BadRequestException(), context.host as never);
    await filter.catch(parseError, context.host as never);
    await filter.catch(new Error('server failed'), context.host as never);

    expect(context.reply).toHaveBeenLastCalledWith(
      context.response,
      expect.objectContaining({ message: 'Внутренняя ошибка сервера', statusCode: 500 }),
      500,
    );
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Данные создания активности'),
      expect.stringContaining('server failed'),
    );
    expect(loggerError.mock.calls.some(([message]) => String(message).includes('[скрыт]'))).toBe(true);
    loggerError.mockRestore();
  });

  it('survives circular request bodies while handling an unknown exception', async () => {
    const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const body: Record<string, unknown> = {};
    body.self = body;
    const context = createContext({ method: 'POST', url: '/activity/user-1', params: {}, body });

    await new AllExceptionsFilter(context.httpAdapterHost as never).catch({ status: 422 }, context.host as never);

    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('не удалось сериализовать тело запроса'));
    loggerWarn.mockRestore();
  });
});
