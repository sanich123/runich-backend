import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import LoggingService from './logger.middleware';

describe('LoggingService', () => {
  it('logs successful, client-error and server-error responses', () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const finishHandlers: Array<() => void> = [];
    const response = {
      on: jest.fn((_event: string, handler: () => void) => finishHandlers.push(handler)),
      statusCode: 200,
      statusMessage: 'OK',
    };
    const request = { method: 'GET', params: { id: 'activity-1' }, url: '/activity/activity-1' };
    const next = jest.fn();
    const service = new LoggingService();

    service.use(request as never, response as never, next);
    expect(next).toHaveBeenCalledTimes(1);

    finishHandlers[0]();
    response.statusCode = 404;
    response.statusMessage = 'Not Found';
    finishHandlers[0]();
    response.statusCode = 500;
    response.statusMessage = 'Internal Server Error';
    finishHandlers[0]();

    expect(loggerLog).toHaveBeenCalledWith('GET /activity/activity-1 activity-1 OK');
    expect(loggerWarn).toHaveBeenCalledWith('GET /activity/activity-1 activity-1 Not Found');
    expect(loggerError).toHaveBeenCalledWith('GET /activity/activity-1 activity-1 Internal Server Error');
    jest.restoreAllMocks();
  });

  it('uses a no-params marker when the request has no route params', () => {
    const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const finishHandlers: Array<() => void> = [];
    const response = {
      on: jest.fn((_event: string, handler: () => void) => finishHandlers.push(handler)),
      statusCode: 200,
      statusMessage: 'OK',
    };

    new LoggingService().use({ method: 'GET', params: {}, url: '/health/live' } as never, response as never, jest.fn());
    finishHandlers[0]();

    expect(loggerLog).toHaveBeenCalledWith('GET /health/live no params OK');
    jest.restoreAllMocks();
  });
});
