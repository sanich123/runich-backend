import { Logger } from '@nestjs/common';
import { writeLogs } from './logs';

export function uncaughtErrorHandler({ message, stack }: Error): void {
  const logger = new Logger('Process');
  logger.error(`Необработанное исключение: ${message}`, stack);
  void writeLogs(`${new Date().toISOString()} Необработанное исключение: ${message}\n${stack ?? ''}`);
  process.exitCode = 1;
}

export function unhandledRejectionHandler({ message, stack }: Error): void {
  const logger = new Logger('Process');
  logger.error(`Необработанная ошибка Promise: ${message}`, stack);
  void writeLogs(`${new Date().toISOString()} Необработанная ошибка Promise: ${message}\n${stack ?? ''}`);
  process.exitCode = 1;
}
