import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export default class LoggingService implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction) {
    response.on('finish', () => {
      const { method, params, url } = request;
      const { statusCode, statusMessage } = response;
      const message = `${method} ${url} ${params.id ?? 'no params'} ${statusMessage}`;

      if (statusCode >= 500) {
        return this.logger.error(message);
      }

      if (statusCode >= 400) {
        return this.logger.warn(message);
      }

      return this.logger.log(message);
    });

    next();
  }
}
