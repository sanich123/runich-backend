import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import LoggingService from '../logger.middleware';

function createResponse(statusCode: number, statusMessage: string) {
  const response = new EventEmitter() as Response;
  Object.assign(response, { statusCode, statusMessage });
  return response;
}

function createRequest() {
  return {
    method: 'GET',
    path: '/activities/1',
    params: { id: 'activity-1' },
    route: { path: '/activities/:id' },
  } as unknown as Request;
}

describe('LoggingService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records every request but logs only slow successful requests', () => {
    const metrics = { observeHttp: jest.fn() };
    const service = new LoggingService(metrics as never);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const now = jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(301);
    const response = createResponse(200, 'OK');

    service.use(createRequest(), response, jest.fn());
    response.emit('finish');

    expect(now).toHaveBeenCalledTimes(2);
    expect(metrics.observeHttp).toHaveBeenCalledWith('GET /activities/:id', 301);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('301.0ms'));
  });

  it('does not log a fast successful request and still logs fast errors', () => {
    const metrics = { observeHttp: jest.fn() };
    const service = new LoggingService(metrics as never);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(20);
    const response = createResponse(200, 'OK');
    service.use(createRequest(), response, jest.fn());
    response.emit('finish');
    expect(log).not.toHaveBeenCalled();

    const errorResponse = createResponse(400, 'Bad Request');
    service.use(createRequest(), errorResponse, jest.fn());
    errorResponse.emit('finish');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Bad Request'));
  });

  it('uses warning and error levels for slow client and server responses', () => {
    const service = new LoggingService();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(301)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(301);

    const clientErrorResponse = createResponse(404, 'Not Found');
    service.use({ ...createRequest(), params: {} } as Request, clientErrorResponse, jest.fn());
    clientErrorResponse.emit('finish');

    const serverErrorResponse = createResponse(500, 'Internal Server Error');
    service.use(createRequest(), serverErrorResponse, jest.fn());
    serverErrorResponse.emit('finish');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no params'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Internal Server Error'));
  });
});
