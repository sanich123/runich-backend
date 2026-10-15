import { PushNotificationService } from '../push-notification.service';
import { jest } from '@jest/globals';

describe('PushNotificationService', () => {
  const service = new PushNotificationService();
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  beforeEach(() => fetchSpy.mockReset());
  afterAll(() => fetchSpy.mockRestore());

  it('does not call Expo when the message list is empty', async () => {
    await expect(service.send([])).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts messages and returns a list of tickets', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) } as Response);
    await expect(service.send([{} as never])).resolves.toEqual([{ status: 'ok' }]);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('exp.host'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('normalizes a single ticket and rejects HTTP and malformed response failures', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { status: 'ok' } }) } as Response);
    await expect(service.send([{} as never])).resolves.toEqual([{ status: 'ok' }]);

    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await expect(service.send([{} as never])).rejects.toThrow('HTTP 503');

    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as Response);
    await expect(service.send([{} as never])).rejects.toThrow('неполный список tickets');

    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);
    await expect(service.send([{} as never])).rejects.toThrow('неполный список tickets');
  });

  it('logs permanent failures with both Error and non-Error values', () => {
    const loggerError = jest
      .spyOn((service as never as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation(() => undefined);
    service.logPermanentFailure('job-1', new Error('network error'));
    service.logPermanentFailure('job-2', 'unknown error');
    expect(loggerError).toHaveBeenNthCalledWith(1, 'Push notification job failed permanently job-1', 'network error');
    expect(loggerError).toHaveBeenNthCalledWith(2, 'Push notification job failed permanently job-2', 'unknown error');
    loggerError.mockRestore();
  });
});
