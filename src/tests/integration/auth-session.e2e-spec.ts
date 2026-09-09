import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from 'src/app/app.module';
import { AuthTokenService } from 'src/auth/services/auth-token.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

const describeIntegration = process.env.RUNICH_INTEGRATION === 'true' ? describe : describe.skip;

describeIntegration('PostgreSQL auth and session e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authTokenService: AuthTokenService;
  let jwtService: JwtService;
  let userId: string;
  let email: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    authTokenService = app.get(AuthTokenService);
    jwtService = app.get(JwtService);

    const suffix = randomUUID();
    email = `e2e-auth-${suffix}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        encryptedPassword: await bcrypt.hash('Secret123', 4),
        emailConfirmedAt: new Date(),
        profile: { create: {} },
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await app?.close();
  });

  it('issues one-day access tokens and rotates refresh tokens through HTTP', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Secret123' })
      .expect(200);

    expect(loginResponse.body).toEqual({
      userId,
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    const accessPayload = jwtService.decode<{ iat: number; exp: number }>(loginResponse.body.accessToken);
    const refreshPayload = jwtService.decode<{ iat: number; exp: number }>(loginResponse.body.refreshToken);
    expect(accessPayload!.exp - accessPayload!.iat).toBe(24 * 60 * 60);
    expect(refreshPayload!.exp - refreshPayload!.iat).toBe(30 * 24 * 60 * 60);

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginResponse.body.refreshToken })
      .expect(200);

    expect(refreshResponse.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(refreshResponse.body.refreshToken).not.toBe(loginResponse.body.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginResponse.body.refreshToken })
      .expect(401);

    const sessionCount = await prisma.userSession.count({ where: { userId } });
    expect(sessionCount).toBe(1);
  });

  it('exchanges a one-time email code for session tokens and rejects reuse', async () => {
    const code = await authTokenService.createEmailLoginCredential(userId);

    const verifyResponse = await request(app.getHttpServer()).post('/auth/verify').send({ code }).expect(201);

    expect(verifyResponse.body).toEqual({
      userId,
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    const exchange = await prisma.authExchange.findFirst({
      where: { userId, purpose: 'email_login' },
      orderBy: { createdAt: 'desc' },
    });
    expect(exchange?.consumedAt).toBeInstanceOf(Date);

    await request(app.getHttpServer()).post('/auth/verify').send({ code }).expect(401);
  });

  it('rejects an expired email code', async () => {
    const code = `expired-${randomUUID()}`;
    await prisma.authExchange.create({
      data: {
        userId,
        codeHash: createHash('sha256').update(code).digest('hex'),
        purpose: 'email_login',
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    await request(app.getHttpServer()).post('/auth/verify').send({ code }).expect(401);
  });
});
