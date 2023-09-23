import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaClientExceptionFilter } from 'nestjs-prisma';
import { MAP_ERRORS } from './utils/const';
import { getLogLevels } from './utils/log-levels';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const PORT = Number(process.env.PORT) || 4000;
  const app = await NestFactory.create(AppModule, { logger: getLogLevels(process.env.NODE_ENV === 'production') });
  const config = new DocumentBuilder()
    .setTitle('Runich')
    .setDescription('Runich API')
    .setVersion('1.0')
    .addTag('runich')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaClientExceptionFilter(httpAdapter, MAP_ERRORS));
  app.useGlobalPipes(new ValidationPipe());
  console.log(`App is listening on ${PORT}`);
  await app.listen(PORT);
}
bootstrap();
