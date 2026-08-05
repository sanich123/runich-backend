import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaClientExceptionFilter } from './exceptions/prisma-client-exception.filter';
import { PRISMA_ERR_TO_HTTP_CODES } from './utils/const';
import { getLogLevels } from './utils/log-levels';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { urlencoded, json } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: getLogLevels(process.env.NODE_ENV === 'production') });
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
  console.log(`App is listening on ${PORT}`);
  app.enableCors({ origin: '*', methods: 'GET,HEAD,PUT,PATCH,POST,DELETE' });
  await app.listen(PORT);
}
bootstrap();
