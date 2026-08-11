import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';
import { PRISMA_ERR_TO_HTTP_CODES } from './common/constants';
import { getLogLevels } from './common/utils/log-levels';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { urlencoded, json } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions';
import { uncaughtErrorHandler, unhandledRejectionHandler } from './common/utils/handling-process';

const CORS_ORIGINS = [
  'https://runich.netlify.app',
  'https://stage--runich.netlify.app',
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/\[::1\](?::\d+)?$/,
];

process.on('uncaughtException', uncaughtErrorHandler);
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  unhandledRejectionHandler(error);
});

async function bootstrap() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: getLogLevels(process.env.NODE_ENV === 'production'),
  });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  const config = new DocumentBuilder()
    .setTitle('Runich')
    .setDescription('Runich API')
    .setVersion('1.0')
    .addTag('runich')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  app.useGlobalFilters(new PrismaClientExceptionFilter(PRISMA_ERR_TO_HTTP_CODES));
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.enableCors({ origin: CORS_ORIGINS, methods: 'GET,HEAD,PUT,PATCH,POST,DELETE' });
  await app.listen(PORT);
  Logger.log(`App is listening on ${PORT}`, 'Bootstrap');
}
void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Application failed to start', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
