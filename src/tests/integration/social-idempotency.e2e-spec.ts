import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from 'src/app/app.module';
import { AuthTokenService } from 'src/auth/services/auth-token.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

const describeIntegration = process.env.RUNICH_INTEGRATION === 'true' ? describe : describe.skip;

describeIntegration('PostgreSQL social idempotency e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let targetId: string;
  let activityId: string;
  let commentId: string;
  let ownerToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    const authTokenService = app.get(AuthTokenService);
    const suffix = randomUUID();

    const owner = await prisma.user.create({
      data: { email: `e2e-social-owner-${suffix}@example.com`, profile: { create: {} } },
      include: { profile: true },
    });
    const target = await prisma.user.create({
      data: { email: `e2e-social-target-${suffix}@example.com`, profile: { create: {} } },
      include: { profile: true },
    });
    ownerId = owner.id;
    targetId = target.id;

    const activity = await prisma.activity.create({
      data: {
        userId: owner.id,
        profileId: owner.profile!.id,
        title: 'E2E social activity',
        sport: 'run',
        duration: 60,
        distance: 1,
        speed: 1,
        isPublic: true,
      },
    });
    activityId = activity.id;

    const comment = await prisma.comment.create({
      data: {
        profileId: owner.profile!.id,
        activityId: activity.id,
        authorId: owner.id,
        comment: 'E2E comment',
      },
    });
    commentId = comment.id;
    ownerToken = (await authTokenService.createSessionTokens(owner.id, { deviceId: `e2e-social-${suffix}` }))
      .accessToken;
  });

  afterAll(async () => {
    if (prisma && ownerId && targetId) {
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, targetId] } } });
    }
    await app?.close();
  });

  it('returns HTTP 200 and creates one follow under concurrent requests', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer()).post(`/friend/${targetId}`).set('Authorization', `Bearer ${ownerToken}`),
      request(app.getHttpServer()).post(`/friend/${targetId}`).set('Authorization', `Bearer ${ownerToken}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    await expect(prisma.friend.count({ where: { userId: ownerId, friendId: targetId } })).resolves.toBe(1);
  });

  it('returns HTTP 200 and creates one activity like under concurrent requests', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/like').set('Authorization', `Bearer ${ownerToken}`).send({ activityId }),
      request(app.getHttpServer()).post('/like').set('Authorization', `Bearer ${ownerToken}`).send({ activityId }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    await expect(prisma.like.count({ where: { authorId: ownerId, activityId } })).resolves.toBe(1);
  });

  it('returns HTTP 200 and creates one comment like under concurrent requests', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/comment/${commentId}/like`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ commentId }),
      request(app.getHttpServer())
        .post(`/comment/${commentId}/like`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ commentId }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
    await expect(prisma.commentLike.count({ where: { authorId: ownerId, commentId } })).resolves.toBe(1);
  });
});
