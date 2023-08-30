import { Logger } from '@nestjs/common';
import { writeLogs } from './logs';

export function uncaughtErrorHandler({ message, stack }: Error): void {
  console.error(`${new Date().toUTCString()} uncaughtException: `, message);
  console.error(stack);
  process.exitCode = 1;
}

export function unhandledRejectionHandler({ message, stack }: Error): void {
  console.error(`${new Date().toUTCString()} uncaughtRejection: `, message);
  console.error(stack);
  process.exitCode = 1;
}

export function processStdinHandler(data: Buffer) {
  const logs = data.toString();
  Logger.log(logs);
  writeLogs(`Process stdin ${logs}`);
  process.stdout.write(logs);
}
