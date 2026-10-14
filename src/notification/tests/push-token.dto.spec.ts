import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBody, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PushTokenDto } from '../push-token.dto';

@Controller('push-token-schema-test')
class PushTokenSchemaTestController {
  @Post()
  @ApiBody({ type: PushTokenDto })
  register(@Body() dto: PushTokenDto) {
    return dto;
  }
}

@Module({ controllers: [PushTokenSchemaTestController] })
class PushTokenSchemaTestModule {}

describe('PushTokenDto Swagger schema', () => {
  it('generates a string schema for the push token', async () => {
    const app = await NestFactory.create(PushTokenSchemaTestModule, { logger: false });

    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Test').setVersion('1').build(),
      );
      const schema = document.components?.schemas?.PushTokenDto;

      expect(schema).toEqual(
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            token: expect.objectContaining({ type: 'string' }),
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});
