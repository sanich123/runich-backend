import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function unauthorized(response: Response) {
  response.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
  response.status(401).send('Authentication required');
}

export function createSwaggerBasicAuth(username: string, password: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Basic ')) {
      unauthorized(response);
      return;
    }

    const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex < 0) {
      unauthorized(response);
      return;
    }

    const suppliedUsername = decoded.slice(0, separatorIndex);
    const suppliedPassword = decoded.slice(separatorIndex + 1);

    if (!secureEqual(suppliedUsername, username) || !secureEqual(suppliedPassword, password)) {
      unauthorized(response);
      return;
    }

    next();
  };
}
