import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import AdmZip from 'adm-zip';
import request from 'supertest';
import { AppModule } from 'src/app/app.module';
import { ActivityMigrationService } from 'src/activity/activity-migration.service';
import { AuthTokenService } from 'src/auth/services/auth-token.service';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/storage.service';

const describeIntegration = process.env.RUNICH_INTEGRATION === 'true' ? describe : describe.skip;

describeIntegration('PostgreSQL API smoke e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageService: StorageService;
  let jwtService: JwtService;
  let ownerId: string;
  let visitorId: string;
  let targetId: string;
  let profilelessId: string;
  let ownerProfileId: string;
  let activityId: string;
  let ownerToken: string;
  let visitorToken: string;
  let profilelessToken: string;
  let ownerEmail: string;
  let activityDate: Date;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    storageService = app.get(StorageService);
    jwtService = app.get(JwtService);
    const authTokenService = app.get(AuthTokenService);
    const suffix = randomUUID();
    ownerEmail = `e2e-api-owner-${suffix}@example.com`;

    const owner = await prisma.user.create({
      data: { email: ownerEmail, profile: { create: {} } },
      include: { profile: true },
    });
    const visitor = await prisma.user.create({
      data: { email: `e2e-api-visitor-${suffix}@example.com`, profile: { create: {} } },
      include: { profile: true },
    });
    const target = await prisma.user.create({
      data: { email: `e2e-api-target-${suffix}@example.com`, profile: { create: {} } },
      include: { profile: true },
    });
    const profileless = await prisma.user.create({
      data: { email: `e2e-api-profileless-${suffix}@example.com` },
    });

    ownerId = owner.id;
    visitorId = visitor.id;
    targetId = target.id;
    profilelessId = profileless.id;
    ownerProfileId = owner.profile!.id;
    activityDate = new Date();

    const activityIdForRoute = randomUUID();
    const routeMetadata = await storageService.uploadActivityRoute(owner.id, activityIdForRoute, [
      { coords: { latitude: 55.75, longitude: 37.61 } },
    ]);
    const activity = await prisma.activity.create({
      data: {
        id: activityIdForRoute,
        userId: owner.id,
        profileId: owner.profile!.id,
        date: activityDate,
        title: 'API smoke activity',
        description: 'Activity used by PostgreSQL API tests',
        sport: 'run',
        duration: 3600,
        distance: 10,
        speed: 10,
        visibility: 'public',
        routeStorageKey: routeMetadata.key,
        routeFormatVersion: routeMetadata.formatVersion,
        routePointCount: routeMetadata.pointCount,
        routeSizeBytes: routeMetadata.sizeBytes,
        routeChecksum: routeMetadata.checksum,
        media: {
          create: [
            {
              userId: owner.id,
              activityDate,
              position: 0,
              url: 'https://example.com/photo.jpg',
              thumbnail: null,
              blurhash: 'test-blurhash',
            },
          ],
        },
      },
    });
    activityId = activity.id;

    ownerToken = (await authTokenService.createSessionTokens(owner.id, { deviceId: `e2e-api-owner-${suffix}` }))
      .accessToken;
    visitorToken = (await authTokenService.createSessionTokens(visitor.id, { deviceId: `e2e-api-visitor-${suffix}` }))
      .accessToken;
    profilelessToken = (
      await authTokenService.createSessionTokens(profileless.id, { deviceId: `e2e-api-profileless-${suffix}` })
    ).accessToken;
  });

  afterAll(async () => {
    if (prisma && ownerId && visitorId && targetId && profilelessId) {
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, visitorId, targetId, profilelessId] } } });
    }
    await app?.close();
  }, 60_000);

  it('serves health and public auth configuration endpoints', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({ status: 'ok' });
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        checks: { database: 'ok' },
      });
    await request(app.getHttpServer()).get('/auth/config').expect(200).expect({ appVersion: '1.0.0' });
  });

  it('reads and updates profiles through the HTTP API', async () => {
    const profileResponse = await request(app.getHttpServer())
      .get(`/user/${ownerId}/profile`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(profileResponse.body.id).toBe(ownerProfileId);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/user/${ownerId}/profile`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'API', surname: 'Owner', city: 'Moscow' })
      .expect(200);
    expect(updateResponse.body).toMatchObject({ name: 'API', surname: 'Owner', city: 'Moscow' });

    const createResponse = await request(app.getHttpServer())
      .post(`/user/${profilelessId}/profile`)
      .set('Authorization', `Bearer ${profilelessToken}`)
      .send({ name: 'Created', surname: 'Profile' })
      .expect(201);
    expect(createResponse.body).toMatchObject({ userId: profilelessId, name: 'Created' });

    const filterResponse = await request(app.getHttpServer())
      .get('/profile/filter')
      .query({ email: ownerEmail, take: '10' })
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(filterResponse.body.items.map((profile: { userId: string }) => profile.userId)).toContain(ownerId);
  });

  it('covers activity create, read, update, query and delete endpoints', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`/activity/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        date: activityDate.toISOString(),
        title: 'Created through API',
        description: 'Description created through API',
        sport: 'ride',
        duration: 120,
        distance: 4,
        speed: 2,
        visibility: 'public',
      })
      .expect(201);
    const createdActivityId = createResponse.body.id as string;
    expect(createResponse.body).toMatchObject({
      userId: ownerId,
      title: 'Created through API',
      description: 'Description created through API',
    });

    const listResponse = await request(app.getHttpServer())
      .get(`/activity/${ownerId}`)
      .query({ take: '10' })
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(listResponse.body.activities.map((activity: { id: string }) => activity.id)).toEqual(
      expect.arrayContaining([activityId, createdActivityId]),
    );
    expect(listResponse.body.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _count: { comments: expect.any(Number), likes: expect.any(Number) },
        }),
      ]),
    );
    for (const listActivity of listResponse.body.activities as Array<Record<string, unknown>>) {
      expect(listActivity).not.toHaveProperty('description');
    }

    await request(app.getHttpServer())
      .get(`/activity/activityId/${activityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(activityId);
        expect(response.body.description).toBe('Activity used by PostgreSQL API tests');
        expect(response.body._count.comments).toEqual(expect.any(Number));
      });

    await request(app.getHttpServer())
      .get(`/activity/${activityId}/locations`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200)
      .expect((response) => expect(response.body.locations).toHaveLength(1));

    await request(app.getHttpServer())
      .get(`/activity/${ownerId}/media`)
      .query({ take: '10' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.media).toHaveLength(1));

    const idsResponse = await request(app.getHttpServer())
      .get('/activity/activityIds')
      .query({ ids: `${activityId},${createdActivityId}` })
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(idsResponse.body.map((activity: { id: string }) => activity.id)).toEqual(
      expect.arrayContaining([activityId, createdActivityId]),
    );

    const allResponse = await request(app.getHttpServer())
      .get(`/activity/${ownerId}/all`)
      .query({ take: '10' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(allResponse.body.activities.map((activity: { id: string }) => activity.id)).toEqual(
      expect.arrayContaining([activityId, createdActivityId]),
    );
    expect(allResponse.body.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _count: { comments: expect.any(Number), likes: expect.any(Number) },
        }),
      ]),
    );

    const updateResponse = await request(app.getHttpServer())
      .patch(`/activity/${createdActivityId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Updated through API', sport: 'ride', duration: 130, distance: 4.5, speed: 2.5 })
      .expect(201);
    expect(updateResponse.body).toMatchObject({ id: createdActivityId, title: 'Updated through API' });

    await request(app.getHttpServer())
      .delete(`/activity/${createdActivityId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await expect(prisma.activity.findUnique({ where: { id: createdActivityId } })).resolves.toBeNull();
  });

  it('covers comments, comment likes and activity likes through HTTP', async () => {
    const createCommentResponse = await request(app.getHttpServer())
      .post(`/comment/${activityId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ comment: 'Created through API' })
      .expect(201);
    expect(createCommentResponse.status).toBe(201);

    const comment = await prisma.comment.findFirst({
      where: { activityId, authorId: ownerId, comment: 'Created through API' },
      orderBy: { date: 'desc' },
    });
    expect(comment).not.toBeNull();
    const commentId = comment!.id;

    const commentsResponse = await request(app.getHttpServer())
      .get(`/comment/${activityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(commentsResponse.body.comments.map((item: { id: string }) => item.id)).toContain(commentId);

    await request(app.getHttpServer())
      .get(`/comment/${activityId}/count`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200)
      .expect((response) => expect(Number(response.text)).toBeGreaterThanOrEqual(1));

    const updateCommentResponse = await request(app.getHttpServer())
      .patch(`/comment/${commentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ comment: 'Updated through API' })
      .expect(201);
    expect(updateCommentResponse.body).toMatchObject({ id: commentId, comment: 'Updated through API' });

    const commentLikeResponse = await request(app.getHttpServer())
      .post(`/comment/${commentId}/like`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .send({ commentId })
      .expect(200);
    const commentLikeId = commentLikeResponse.body.id as string;

    await request(app.getHttpServer())
      .get(`/comment/${commentId}/like`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.map((item: { id: string }) => item.id)).toContain(commentLikeId));

    await request(app.getHttpServer())
      .delete(`/comment/${commentLikeId}/like`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(204);

    const likeResponse = await request(app.getHttpServer())
      .post('/like')
      .set('Authorization', `Bearer ${visitorToken}`)
      .send({ activityId })
      .expect(200);
    const likeId = likeResponse.body.id as string;

    await request(app.getHttpServer())
      .get(`/like/${activityId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.likes.map((item: { id: string }) => item.id)).toContain(likeId));

    await request(app.getHttpServer())
      .delete(`/like/${likeId}/${activityId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/comment/${commentId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await expect(prisma.comment.findUnique({ where: { id: commentId } })).resolves.toBeNull();
  });

  it('covers friend lists, followers and relationship deletion', async () => {
    const followResponse = await request(app.getHttpServer())
      .post(`/friend/${targetId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const friendId = followResponse.body.id as string;

    await request(app.getHttpServer())
      .get(`/friend/${ownerId}`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200)
      .expect((response) => expect(response.body.map((item: { id: string }) => item.id)).toContain(friendId));

    await request(app.getHttpServer())
      .get(`/friend/${targetId}/followers`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200)
      .expect((response) => expect(response.body.map((item: { id: string }) => item.id)).toContain(friendId));

    await request(app.getHttpServer())
      .delete(`/friend/${friendId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await expect(prisma.friend.findUnique({ where: { id: friendId } })).resolves.toBeNull();
  });

  it('covers all statistics endpoints for a user with activities', async () => {
    const year = activityDate.getUTCFullYear().toString();
    const month = activityDate.getUTCMonth().toString();
    const day = activityDate.toISOString().slice(0, 10);

    await request(app.getHttpServer())
      .get(`/statistics/${ownerId}/year-category`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.isUserHasActivities).toBe(true));

    await request(app.getHttpServer())
      .get(`/statistics/${ownerId}/year-month`)
      .query({ year, month })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.activitiesReducedBySport.all.totalItems).toBeGreaterThanOrEqual(1));

    await request(app.getHttpServer())
      .get(`/statistics/${ownerId}/week`)
      .query({ firstDay: day, lastDay: day })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.totalItems).toBeGreaterThanOrEqual(1));

    await request(app.getHttpServer())
      .get(`/statistics/${ownerId}/all`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.totalItems).toBeGreaterThanOrEqual(1));
  });

  it('covers protected auth edge cases, session location and upload validation', async () => {
    const tokenPayload = jwtService.decode<{ sessionId?: string }>(ownerToken);
    expect(tokenPayload?.sessionId).toBeTruthy();

    await request(app.getHttpServer())
      .patch('/auth/session/location')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ latitude: 55.75, longitude: 37.61 })
      .expect(200)
      .expect({ updated: true });

    const session = await prisma.userSession.findUnique({ where: { id: tokenPayload!.sessionId } });
    expect(session).toMatchObject({ lastLatitude: 55.75, lastLongitude: 37.61 });

    await request(app.getHttpServer()).post('/auth/by-email-link').send({ email: 'missing@example.com' }).expect(404);
    await request(app.getHttpServer())
      .post('/auth/get-email-code-for-password')
      .send({ email: 'missing@example.com' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/auth/confirm-email')
      .send({ email: 'missing@example.com', confirmationCode: '1234' })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/activity/migration-strava/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('archive', Buffer.from('not a zip'), 'archive.txt')
      .expect(400);
  });

  it('queues a Strava archive and commits it through the migration worker', async () => {
    const sourceActivityId = `e2e-strava-${randomUUID()}`;
    const zip = new AdmZip();
    zip.addFile(
      'activities/run.gpx',
      Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?>' +
          '<gpx version="1.1" creator="Runich" xmlns="http://www.topografix.com/GPX/1/1">' +
          '<trk><name>E2E run</name><trkseg>' +
          '<trkpt lat="55.75" lon="37.61"><time>2026-09-07T08:00:00.000Z</time></trkpt>' +
          '<trkpt lat="55.76" lon="37.62"><time>2026-09-07T08:01:00.000Z</time></trkpt>' +
          '</trkseg></trk></gpx>',
      ),
    );
    zip.addFile(
      'activities.csv',
      Buffer.from(
        'Activity ID,Filename,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Moving Time,Distance\n' +
          `${sourceActivityId},activities/run.gpx,2026-09-07T08:00:00.000Z,E2E run,Run,Imported in e2e,300,240,1.25\n`,
      ),
    );

    const uploadResponse = await request(app.getHttpServer())
      .post(`/activity/migration-strava/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('archive', zip.toBuffer(), 'strava-export.zip')
      .expect(202);
    expect(uploadResponse.body).toMatchObject({ status: 'queued', processedActivities: 0 });
    expect(uploadResponse.body).toEqual(
      expect.objectContaining({
        queuePosition: expect.any(Number),
        queueAhead: expect.any(Number),
        queueSize: expect.any(Number),
      }),
    );

    const migrationService = app.get(ActivityMigrationService);
    let job = await prisma.activityMigrationJob.findUnique({ where: { id: uploadResponse.body.jobId } });
    for (let attempt = 0; attempt < 10 && job?.status !== 'completed' && job?.status !== 'failed'; attempt += 1) {
      if (job?.status === 'queued') await migrationService.processNextJob();
      else await delay(50);
      job = await prisma.activityMigrationJob.findUnique({ where: { id: uploadResponse.body.jobId } });
    }

    expect(job).toMatchObject({
      status: 'completed',
      totalActivities: 1,
      processedActivities: 1,
      importedActivities: 1,
      skippedActivities: 0,
    });
    await request(app.getHttpServer())
      .get(`/activity/migration-strava/jobs/${uploadResponse.body.jobId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({
          status: 'completed',
          importedActivities: 1,
          queuePosition: null,
          queueAhead: 0,
          queueSize: 0,
        }),
      );
    const importedActivity = await prisma.activity.findFirst({
      where: { userId: ownerId, source: 'strava', sourceActivityId },
    });
    expect(importedActivity).toMatchObject({
      title: 'E2E run',
      description: 'Imported in e2e',
      profileId: ownerProfileId,
      routeStorageKey: expect.stringContaining(`/activities/${importedActivity!.id}/locations/locations-v1.json.gz`),
    });
    await request(app.getHttpServer())
      .get(`/activity/${importedActivity!.id}/locations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.body.locations).toHaveLength(2));
    await request(app.getHttpServer())
      .get(`/activity/activityId/${importedActivity!.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.description).toBe('Imported in e2e');
        expect(response.body._count).toEqual({ comments: 0, likes: 0 });
      });
  }, 60_000);

  it('removes client-triggered email endpoints, protects feedback, and redirects OAuth errors safely', async () => {
    await request(app.getHttpServer()).post('/email/like').send({}).expect(404);
    await request(app.getHttpServer()).post('/email/comment').send({}).expect(404);
    await request(app.getHttpServer()).post('/email/commentLike').send({}).expect(404);
    await request(app.getHttpServer()).post('/email/feedback').send({}).expect(401);

    const yandexError = await request(app.getHttpServer())
      .get('/auth/yandex/callback')
      .query({ error: 'denied' })
      .expect(302);
    expect(yandexError.headers.location).toContain('oauthError=denied');

    const vkError = await request(app.getHttpServer()).get('/auth/vk/callback').query({ error: 'denied' }).expect(302);
    expect(vkError.headers.location).toContain('oauthProvider=vk');
  });
});
