import { ServiceUnavailableException, Logger } from '@nestjs/common';
import { jest } from '@jest/globals';
import { AuthEmailService } from '../services/auth-email.service';

describe('AuthEmailService', () => {
  const emailService = {
    sendConfirmationCode: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    sendLoginLink: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    sendPasswordChangeCode: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  let service: AuthEmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthEmailService(emailService as never);
  });

  it('forwards every email operation', async () => {
    await expect(service.sendConfirmationCode('user@example.com', 1234, 'token')).resolves.toBeUndefined();
    await expect(service.sendLoginLink('user@example.com', 'token')).resolves.toBeUndefined();
    await expect(service.sendPasswordChangeCode('user@example.com', 123456)).resolves.toBeUndefined();

    expect(emailService.sendConfirmationCode).toHaveBeenCalledWith('user@example.com', 1234, 'token');
    expect(emailService.sendLoginLink).toHaveBeenCalledWith('user@example.com', 'token');
    expect(emailService.sendPasswordChangeCode).toHaveBeenCalledWith('user@example.com', 123456);
  });

  it('maps every email provider failure to service unavailable', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const error = new Error('provider unavailable');
    emailService.sendConfirmationCode.mockRejectedValue(error);
    emailService.sendLoginLink.mockRejectedValue(error);
    emailService.sendPasswordChangeCode.mockRejectedValue(error);

    await expect(service.sendConfirmationCode('user@example.com', 1234, 'token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.sendLoginLink('user@example.com', 'token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.sendPasswordChangeCode('user@example.com', 123456)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(loggerError).toHaveBeenCalledTimes(3);
    loggerError.mockRestore();
  });
});
