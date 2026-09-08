class SqlQueryError extends Error {
  code?: string;
  cause?: { code?: string };

  constructor(message: string, details: { code?: string; cause?: { code?: string } } = {}) {
    super(message);
    this.name = 'SqlQueryError';
    Object.assign(this, details);
  }
}

class DatabaseUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnknownError';
  }
}

class DatabaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseValidationError';
  }
}

export const DatabaseErrors = {
  SqlQueryError,
  DatabaseUnknownError,
  DatabaseValidationError,
};
