import { Logger } from '@nestjs/common';

// Nest's ConsoleLogger writes directly to process streams, bypassing Jest's silent option.
Logger.overrideLogger(false);
