import { createRequire } from 'node:module';

type NestReflector = typeof import('@nestjs/core').Reflector;

const require = createRequire(import.meta.url);
export const ThrottlerReflector = require('@nestjs/core').Reflector as NestReflector;
