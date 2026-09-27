import { createObserveModule } from '@nestjs/observe';

const appKey = process.env.OBSERVE_APP_KEY?.trim();
const appSecret = process.env.OBSERVE_APP_SECRET?.trim();

if (Boolean(appKey) !== Boolean(appSecret)) {
  throw new Error('OBSERVE_APP_KEY and OBSERVE_APP_SECRET must be configured together.');
}

const isObserveEnabled = Boolean(appKey && appSecret);
const { ObserveModule, ObserveInstrument } = createObserveModule({ sourceContext: false });

export const observeImports = isObserveEnabled
  ? [
      ObserveModule.forRoot({
        appKey: appKey!,
        appSecret: appSecret!,
        serviceId: process.env.RUNICH_PROCESS === 'worker' ? 'runich-backend-worker' : 'runich-backend',
        serviceVersion: process.env.OBSERVE_SERVICE_VERSION,
        forwardLogs: false,
        http: {
          capture: false,
          ignore: ['/health/live', '/health/ready'],
        },
      }),
    ]
  : [];

export const observeInstrument = isObserveEnabled ? ObserveInstrument : undefined;
