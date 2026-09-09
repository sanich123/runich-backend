import { jest } from '@jest/globals';
import { createSwaggerBasicAuth } from '../swagger-basic-auth';

function createResponse() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
}

describe('createSwaggerBasicAuth', () => {
  it.each([undefined, 'Bearer token', 'Basic not-base64-credentials'])('rejects %s', (authorization) => {
    const response = createResponse();
    const next = jest.fn();
    const request = { headers: { authorization } };

    createSwaggerBasicAuth('admin', 'secret')(request as never, response as never, next);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.send).toHaveBeenCalledWith('Authentication required');
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials and accepts valid credentials', () => {
    const invalidResponse = createResponse();
    const next = jest.fn();
    const middleware = createSwaggerBasicAuth('admin', 'secret');
    middleware(
      { headers: { authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}` } } as never,
      invalidResponse as never,
      next,
    );
    expect(invalidResponse.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    const validResponse = createResponse();
    middleware(
      { headers: { authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` } } as never,
      validResponse as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(validResponse.status).not.toHaveBeenCalled();
  });
});
