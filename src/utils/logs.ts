import { InternalServerErrorException } from '@nestjs/common';
import { appendFile } from 'node:fs/promises';

export async function writeLogs(log: string) {
  try {
    await appendFile('logs.log', `${log}\n`);
  } catch (error) {
    console.log(error)
    throw new InternalServerErrorException('Something wrong with write logs to file');
  }
}
