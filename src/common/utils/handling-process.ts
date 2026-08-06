import { Logger } from '@nestjs/common';
import { writeLogs } from './logs';

export function uncaughtErrorHandler({ message, stack }: Error): void {
  const logger = new Logger('Process');
  logger.error(`uncaughtException: ${message}`, stack);
  void writeLogs(`${new Date().toISOString()} uncaughtException: ${message}\n${stack ?? ''}`);
  process.exitCode = 1;
}

export function unhandledRejectionHandler({ message, stack }: Error): void {
  const logger = new Logger('Process');
  logger.error(`unhandledRejection: ${message}`, stack);
  void writeLogs(`${new Date().toISOString()} unhandledRejection: ${message}\n${stack ?? ''}`);
  process.exitCode = 1;
}

export function processStdinHandler(data: Buffer) {
  const logs = data.toString();
  Logger.log(logs);
  void writeLogs(`Process stdin ${logs}`);
  process.stdout.write(logs);
}
