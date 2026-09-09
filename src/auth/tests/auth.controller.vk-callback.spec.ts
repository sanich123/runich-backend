import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import type { Response } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

describe('AuthController VK callback HTTP contract', () => {
  let app: INestApplication;
  const handleVkCallback = jest.fn((_code: string, _state: string, _error: string | undefined, response: Response) =>
    response.redirect('/oauth-complete'),
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        ThrottlerModule.forRoot([{ name: 'default', limit: 5, ttl: 60_000 }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { handleVkCallback } },
        { provide: PrismaService, useValue: {} },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: ThrottlerGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    handleVkCallback.mockClear();
  });

  it('passes VK callback device_id to the auth service', async () => {
    await request(app.getHttpAdapter().getInstance())
      .get('/auth/vk/callback')
      .query({ code: 'provider-code', state: 'signed-state', device_id: 'device-1' })
      .expect(302)
      .expect('Location', '/oauth-complete');

    expect(handleVkCallback).toHaveBeenCalledWith(
      'provider-code',
      'signed-state',
      undefined,
      expect.anything(),
      'device-1',
    );
  });
});
