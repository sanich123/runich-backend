import { jest } from '@jest/globals';

const appendFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('node:fs/promises', () => ({ appendFile }));

const { writeLogs } = await import('../logs');

describe('writeLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LOG_FILE_PATH;
  });

  it('appends a log line to the application log', async () => {
    await expect(writeLogs('hello')).resolves.toBeUndefined();
    expect(appendFile).toHaveBeenCalledWith('logs.log', 'hello\n');
  });

  it('does not throw when the log file cannot be written', async () => {
    const loggerError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    appendFile.mockRejectedValue(new Error('read-only filesystem'));

    await expect(writeLogs('hello')).resolves.toBeUndefined();
    loggerError.mockRestore();
  });
});
