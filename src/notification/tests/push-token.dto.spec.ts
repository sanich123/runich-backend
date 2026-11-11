import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBody, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { validate } from 'class-validator';
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
  it.each(['android', 'ios'] as const)('accepts the %s platform', async (platform) => {
    const errors = await validate(
      Object.assign(new PushTokenDto(), { token: 'ExpoPushToken[device-token]', platform }),
    );

    expect(errors).toHaveLength(0);
  });

  it('rejects unsupported platforms', async () => {
    const errors = await validate(
      Object.assign(new PushTokenDto(), { token: 'ExpoPushToken[device-token]', platform: 'web' }),
    );

    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'platform' })]));
  });

  it('generates a string schema for the push token and documents both native platforms', async () => {
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
            platform: expect.objectContaining({ enum: ['android', 'ios'] }),
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});
