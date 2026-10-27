import { applyDecorators, DynamicModule, Global, Module, SetMetadata } from '@nestjs/common';

type ThrottlerSettings = {
  ttl?: number;
  limit?: number;
  blockDuration?: number;
  getTracker?: unknown;
  generateKey?: unknown;
};

type ThrottleOptions = Record<string, ThrottlerSettings>;

const THROTTLER_TTL = 'THROTTLER:TTL';
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_BLOCK_DURATION = 'THROTTLER:BLOCK_DURATION';
const THROTTLER_TRACKER = 'THROTTLER:TRACKER';
const THROTTLER_KEY_GENERATOR = 'THROTTLER:KEY_GENERATOR';
const THROTTLER_SKIP = 'THROTTLER:SKIP';

export class ThrottlerGuard {}

@Global()
@Module({})
export class ThrottlerModule {
  static forRoot(options: unknown[]): DynamicModule {
    return {
      module: ThrottlerModule,
      providers: [{ provide: 'THROTTLER:MODULE_OPTIONS', useValue: options }, ThrottlerGuard],
      exports: [ThrottlerGuard],
    };
  }
}

export function Throttle(options: ThrottleOptions): ClassDecorator & MethodDecorator {
  const metadataDecorators = Object.entries(options).flatMap(([name, settings]) => [
    SetMetadata(`${THROTTLER_TTL}${name}`, settings.ttl),
    SetMetadata(`${THROTTLER_LIMIT}${name}`, settings.limit),
    SetMetadata(`${THROTTLER_BLOCK_DURATION}${name}`, settings.blockDuration),
    SetMetadata(`${THROTTLER_TRACKER}${name}`, settings.getTracker),
    SetMetadata(`${THROTTLER_KEY_GENERATOR}${name}`, settings.generateKey),
  ]);

  return applyDecorators(...metadataDecorators);
}

export function SkipThrottle(skip: Record<string, boolean> = { default: true }): ClassDecorator & MethodDecorator {
  return applyDecorators(
    ...Object.entries(skip).map(([name, value]) => SetMetadata(`${THROTTLER_SKIP}${name}`, value)),
  );
}
