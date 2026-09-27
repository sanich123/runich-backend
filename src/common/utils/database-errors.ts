import { HttpException, InternalServerErrorException, Logger } from '@nestjs/common';
import { DatabaseException } from 'src/common/filters/database-exceptions';

const logger = new Logger('Database');

export function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof candidate.code === 'string' && /^P\d{4}$/.test(candidate.code)) return candidate.code;
  switch (candidate.cause?.code) {
    case '23505':
      return 'P2002';
    case '22001':
      return 'P2000';
    case '23503':
      return 'P2003';
    default:
      return undefined;
  }
}

export function isUniqueConstraintError(error: unknown) {
  return getDatabaseErrorCode(error) === 'P2002';
}

export function handleServiceError(error: unknown): never {
  if (error instanceof HttpException) throw error;

  const details = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
  const code = getDatabaseErrorCode(error);
  if (code) {
    logger.error(`Ошибка запроса к базе данных (${code})`, details);
    throw new DatabaseException('Ошибка операции с базой данных', code);
  }
  if (
    error instanceof Error &&
    ['StructuredError', 'SqlQueryError', 'DatabaseUnknownError', 'DatabaseValidationError'].includes(error.name)
  ) {
    logger.error('Ошибка клиента базы данных', details);
    throw new DatabaseException('Ошибка операции с базой данных');
  }

  logger.error('Неожиданная ошибка при выполнении операции', details);
  throw new InternalServerErrorException('Внутренняя ошибка сервера');
}
