import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { MAX_JSON_BODY_BYTES, DATABASE_ERROR_TO_HTTP_STATUS } from './common/constants';
import { getLogLevels } from './common/utils/log-levels';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { urlencoded, json } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions';
import { uncaughtErrorHandler, unhandledRejectionHandler } from './common/utils/handling-process';
import { formatValidationErrors } from './common/utils/validation-errors';
import { getAppEnvironment, getCorsOrigins, isSwaggerEnabled } from './common/config/environment';

process.on('uncaughtException', uncaughtErrorHandler);
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  unhandledRejectionHandler(error);
});

async function bootstrap() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: getLogLevels(getAppEnvironment() === 'production'),
  });
  // Railway terminates the public connection at a proxy. Trust the first proxy
  // hop so request IPs, rate limiting and session metadata use the client IP.
  app.set('trust proxy', 1);
  app.use(json({ limit: MAX_JSON_BODY_BYTES }));
  app.use(urlencoded({ extended: true, limit: MAX_JSON_BODY_BYTES }));

  if (isSwaggerEnabled()) {
    const config = new DocumentBuilder()
      .setTitle('Runich')
      .setDescription('Runich API')
      .setVersion('1.0')
      .addBearerAuth(undefined, 'bearerAuth')
      .addTag('runich')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }
  app.useGlobalFilters(new DatabaseExceptionFilter(DATABASE_ERROR_TO_HTTP_STATUS));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: (errors) => {
        const messages = formatValidationErrors(errors);
        return new BadRequestException(messages.length ? messages : ['Некорректные входные данные']);
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.enableCors({ origin: getCorsOrigins(), methods: 'GET,HEAD,PUT,PATCH,POST,DELETE' });
  await app.listen(PORT);
  Logger.log(`App is listening on ${PORT}`, 'Bootstrap');
}
void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Приложение не удалось запустить', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
