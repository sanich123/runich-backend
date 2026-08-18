import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from 'src/app/app.module';
import { AuthTokenService } from 'src/auth/auth-token.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

const describeIntegration = process.env.RUNICH_INTEGRATION === 'true' ? describe : describe.skip;

describeIntegration('PostgreSQL activity privacy e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authTokenService: AuthTokenService;
  let ownerId: string;
  let visitorId: string;
  let privateActivityId: string;
  let publicActivityId: string;
  let ownerToken: string;
  let visitorToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    authTokenService = app.get(AuthTokenService);
    const suffix = randomUUID();

    const owner = await prisma.users.create({
      data: { email: `e2e-owner-${suffix}@example.com`, profile: { create: {} } },
      include: { profile: true },
    });
    const visitor = await prisma.users.create({
      data: { email: `e2e-visitor-${suffix}@example.com`, profile: { create: {} } },
      include: { profile: true },
    });
    ownerId = owner.id;
    visitorId = visitor.id;

    const activityData = {
      user_id: owner.id,
      profileId: owner.profile!.id,
      date: new Date(),
      title: 'E2E activity',
      sport: 'run',
      duration: 60,
      distance: 1,
      speed: 1,
      locations: [{ coords: { latitude: 55.75, longitude: 37.61 } }],
      photoVideoUrls: [{ url: 'https://example.com/photo.jpg', thumbnail: null }],
    };
    const privateActivity = await prisma.activity.create({ data: { ...activityData, isPublic: false } });
    const publicActivity = await prisma.activity.create({ data: { ...activityData, isPublic: true } });
    privateActivityId = privateActivity.id;
    publicActivityId = publicActivity.id;

    ownerToken = (await authTokenService.createSessionTokens(owner.id, { deviceId: `e2e-owner-${suffix}` }))
      .accessToken;
    visitorToken = (await authTokenService.createSessionTokens(visitor.id, { deviceId: `e2e-visitor-${suffix}` }))
      .accessToken;
  });

  afterAll(async () => {
    if (prisma && ownerId && visitorId) {
      await prisma.users.deleteMany({ where: { id: { in: [ownerId, visitorId] } } });
    }
    await app?.close();
  });

  it('keeps private activities visible to the owner and hidden from other users', async () => {
    const ownerList = await request(app.getHttpServer())
      .get(`/activity/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ownerList.body.activities.map((activity: { id: string }) => activity.id)).toEqual(
      expect.arrayContaining([privateActivityId, publicActivityId]),
    );

    const visitorList = await request(app.getHttpServer())
      .get(`/activity/${ownerId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(visitorList.body.activities.map((activity: { id: string }) => activity.id)).toEqual([publicActivityId]);
  });

  it('protects private activity details, locations, comments and likes', async () => {
    await request(app.getHttpServer())
      .get(`/activity/activityId/${privateActivityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/activity/${privateActivityId}/locations`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/comment/${privateActivityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/like/${privateActivityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(404);
  });

  it('keeps public activity access unchanged', async () => {
    const response = await request(app.getHttpServer())
      .get(`/activity/activityId/${publicActivityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);

    expect(response.body.id).toBe(publicActivityId);
  });
});
