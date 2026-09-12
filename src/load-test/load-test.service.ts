/* eslint-disable @typescript-eslint/no-explicit-any -- bulk load-test fixtures cross the generated repository boundary. */
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/storage.service';
import {
  LOAD_TEST_DEFAULT_CONFIG,
  LOAD_TEST_SEED_STATUS,
  LoadTestAssetManifest,
  LoadTestSeedConfig,
  LoadTestSeedJob,
  LoadTestSeedRequest,
} from './load-test.types';

const TARGET_EMAIL = 'aovoronin.piano@gmail.com';
const MOCK_EMAIL_PREFIX = 'runich.loadtest.';
const DEFAULT_MANIFEST_KEY = 'load-test/stage-feed-v1/manifest.json';
const MOCK_PASSWORD_HASH = '$2b$10$5YM2tf1oixEi8OyMTJh2Bua.1ZELZhXaBAKAllQ1mwQs8t96GnwPK';
const CREATE_BATCH_SIZE = 250;
const MINUTE_IN_MS = 60_000;
const COMMENT_TEXTS = [
  'Сильная тренировка!',
  'Отличный темп и красивый маршрут.',
  'Так держать!',
  'Вдохновляет на свою пробежку.',
  'Классный результат.',
];

type AnyRecord = Record<string, any>;
type SeedUser = { id: string; profileId: string; index: number };

@Injectable()
export class LoadTestSeedService {
  private readonly logger = new Logger(LoadTestSeedService.name);
  private stopRequested = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async enqueue(input: LoadTestSeedRequest = {}) {
    const target = await this.prisma.user.findUnique({
      where: { email: TARGET_EMAIL },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Целевой пользователь stage не найден');

    const runId = input.runId ?? `stage-${Date.now()}`;
    const manifestKey = input.manifestKey ?? process.env.LOAD_TEST_ASSET_MANIFEST_KEY?.trim() ?? DEFAULT_MANIFEST_KEY;
    const config = this.normalizeConfig(input);
    const existing = await this.prisma.loadTestSeedJob.findUnique({ where: { runId } });

    if (existing) {
      if (existing.status === LOAD_TEST_SEED_STATUS.failed) {
        return await this.prisma.loadTestSeedJob.update({
          where: { id: existing.id },
          data: {
            targetUserId: target.id,
            manifestKey,
            config,
            status: LOAD_TEST_SEED_STATUS.queued,
            totalUsers: config.followerCount,
            totalActivities: config.followerCount * config.activitiesPerFollower,
            processedActivities: 0,
            createdActivities: 0,
            createdLikes: 0,
            createdComments: 0,
            createdCommentLikes: 0,
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
          },
        });
      }
      return existing;
    }

    return await this.prisma.loadTestSeedJob.create({
      data: {
        runId,
        targetUserId: target.id,
        manifestKey,
        config,
        status: LOAD_TEST_SEED_STATUS.queued,
        totalUsers: config.followerCount,
        totalActivities: config.followerCount * config.activitiesPerFollower,
      },
    });
  }

  async getJob(runId: string) {
    const job = await this.prisma.loadTestSeedJob.findUnique({ where: { runId } });
    if (!job) throw new NotFoundException('Задача нагрузочного seed не найдена');
    return job;
  }

  async remove(runId: string) {
    const job = await this.prisma.loadTestSeedJob.findUnique({ where: { runId } });
    if (job?.status === LOAD_TEST_SEED_STATUS.processing) {
      throw new ConflictException('Нельзя удалить выполняющуюся load-test задачу');
    }

    const prefix = `${MOCK_EMAIL_PREFIX}${runId}.`;
    const users = await this.prisma.user.findMany({
      where: { email: { startsWith: prefix } },
      select: { id: true },
    });
    const userIds = users.map((user: AnyRecord) => user.id);

    if (userIds.length) {
      await this.prisma.friend.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { friendId: { in: userIds } }],
        },
      });
      await this.prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    }
    if (job) await this.prisma.loadTestSeedJob.delete({ where: { id: job.id } });

    return { runId, deletedUsers: userIds.length };
  }

  requestStop() {
    this.stopRequested = true;
  }

  async runWorker() {
    this.stopRequested = false;
    await this.requeueInterruptedJobs();
    this.logger.log('Worker нагрузочного seed запущен');

    while (!this.stopRequested) {
      try {
        const foundJob = await this.processNextJob();
        if (!foundJob) await delay(5_000);
      } catch (error) {
        this.logger.error('Ошибка цикла worker нагрузочного seed', this.errorMessage(error));
        await delay(5_000);
      }
    }

    this.logger.log('Worker нагрузочного seed остановлен');
  }

  async processNextJob() {
    const job = await this.prisma.loadTestSeedJob.findFirst({
      where: { status: LOAD_TEST_SEED_STATUS.queued },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!job) return false;

    const startedAt = new Date();
    const claimed = await this.prisma.loadTestSeedJob.updateMany({
      where: { id: job.id, status: LOAD_TEST_SEED_STATUS.queued },
      data: {
        status: LOAD_TEST_SEED_STATUS.processing,
        startedAt,
        finishedAt: null,
        errorMessage: null,
      },
    });
    if (claimed.count === 0) return true;

    await this.processJob({ ...job, status: LOAD_TEST_SEED_STATUS.processing, startedAt });
    return true;
  }

  private async processJob(job: LoadTestSeedJob) {
    try {
      const config = this.normalizeStoredConfig(job.config);
      const manifest = await this.readManifest(job.manifestKey);
      this.validateManifest(manifest, config);

      const targetProfile = await this.prisma.profile.findUnique({
        where: { userId: job.targetUserId },
        select: { id: true },
      });
      if (!targetProfile) throw new Error('У целевого пользователя отсутствует профиль');

      const users = await this.ensureUsers(job.runId, config.followerCount);
      await this.createFollowGraph(job, users, targetProfile.id);

      let processedActivities = 0;
      let createdActivities = job.createdActivities;
      let createdLikes = job.createdLikes;
      let createdComments = job.createdComments;
      let createdCommentLikes = job.createdCommentLikes;
      const totalActivities = users.length * config.activitiesPerFollower;

      for (let offset = 0; offset < totalActivities; offset += CREATE_BATCH_SIZE) {
        if (this.stopRequested) {
          await this.releaseForResume(job.id);
          return;
        }

        const activityRows: AnyRecord[] = [];
        const activityRefs: Array<{ id: string; ownerIndex: number; date: Date }> = [];
        const end = Math.min(offset + CREATE_BATCH_SIZE, totalActivities);

        for (let flatIndex = offset; flatIndex < end; flatIndex += 1) {
          const ownerIndex = Math.floor(flatIndex / config.activitiesPerFollower);
          const activityIndex = flatIndex % config.activitiesPerFollower;
          const owner = users[ownerIndex];
          const template = manifest.activities[activityIndex % manifest.activities.length];
          const activityId = this.uuid(`${job.runId}:activity:${ownerIndex}:${activityIndex}`);
          const activityDate = new Date(Date.now() - (flatIndex + 1) * MINUTE_IN_MS);
          const photos = Array.from({ length: config.photosPerActivity }, (_, photoIndex) => {
            const photo = manifest.photos[(flatIndex * 7 + photoIndex * 11 + ownerIndex) % manifest.photos.length];
            return { ...photo, blurhash: null };
          });

          activityRows.push({
            id: activityId,
            userId: owner.id,
            profileId: owner.profileId,
            title: template.title || `Load-test activity #${activityIndex + 1}`,
            description: template.description,
            sport: template.sport || 'run',
            distance: this.safeNumber(template.distance, 5_000),
            duration: Math.max(0, Math.round(this.safeNumber(template.duration, 1_800))),
            speed: this.safeNumber(template.speed, 8),
            elevationGain: template.elevationGain ?? null,
            steps: template.steps ?? null,
            date: activityDate,
            createdAt: activityDate,
            updatedAt: activityDate,
            isPublic: true,
            source: 'load-test',
            sourceActivityId: `${job.runId}:${ownerIndex}:${activityIndex}`,
            photoVideoUrls: photos,
            mapPhotoUrl: photos[0]?.url ?? null,
            mapPhotoUrlBlurhash: null,
            kilometresSplit: template.kilometresSplit ?? null,
            mediaProcessingStatus: 'completed',
            ...(template.route
              ? {
                  routeStorageKey: template.route.key,
                  routeFormatVersion: template.route.formatVersion,
                  routePointCount: template.route.pointCount,
                  routeSizeBytes: template.route.sizeBytes,
                  routeChecksum: template.route.checksum,
                }
              : {}),
          });
          activityRefs.push({ id: activityId, ownerIndex, date: activityDate });
        }

        const activitiesResult = await this.prisma.activity.createMany({ data: activityRows, skipDuplicates: true });
        const relationRows = this.buildRelationRows(job.runId, activityRefs, users, config);
        const likesResult = await this.prisma.like.createMany({ data: relationRows.likes, skipDuplicates: true });
        const commentsResult = await this.prisma.comment.createMany({
          data: relationRows.comments,
          skipDuplicates: true,
        });
        const commentLikesResult = await this.prisma.commentLike.createMany({
          data: relationRows.commentLikes,
          skipDuplicates: true,
        });

        processedActivities = Math.max(processedActivities, end);
        createdActivities += activitiesResult.count;
        createdLikes += likesResult.count;
        createdComments += commentsResult.count;
        createdCommentLikes += commentLikesResult.count;
        await this.prisma.loadTestSeedJob.update({
          where: { id: job.id },
          data: {
            processedActivities,
            createdActivities,
            createdLikes,
            createdComments,
            createdCommentLikes,
          },
        });
        await delay(0);
      }

      createdActivities = totalActivities;
      createdLikes = totalActivities * config.activityLikesPerActivity;
      createdComments = totalActivities * config.commentsPerActivity;
      createdCommentLikes = totalActivities * config.commentsPerActivity * config.commentLikesPerComment;
      await this.prisma.loadTestSeedJob.update({
        where: { id: job.id },
        data: {
          status: LOAD_TEST_SEED_STATUS.completed,
          processedActivities: totalActivities,
          createdActivities: totalActivities,
          createdLikes: totalActivities * config.activityLikesPerActivity,
          createdComments: totalActivities * config.commentsPerActivity,
          createdCommentLikes: totalActivities * config.commentsPerActivity * config.commentLikesPerComment,
          finishedAt: new Date(),
          errorMessage: null,
        },
      });
      this.logger.log(
        `Load-test seed ${job.runId} завершён: users=${users.length}, activities=${createdActivities}, ` +
          `likes=${createdLikes}, comments=${createdComments}, commentLikes=${createdCommentLikes}`,
      );
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      await this.prisma.loadTestSeedJob.update({
        where: { id: job.id },
        data: { status: LOAD_TEST_SEED_STATUS.failed, errorMessage, finishedAt: new Date() },
      });
      this.logger.error(`Не удалось выполнить load-test seed ${job.runId}`, errorMessage);
    }
  }

  private async ensureUsers(runId: string, count: number): Promise<SeedUser[]> {
    const prefix = `${MOCK_EMAIL_PREFIX}${runId}.`;
    const existing = await this.prisma.user.findMany({
      where: { email: { startsWith: prefix } },
      select: { id: true, email: true, profile: { select: { id: true } } },
    });
    const byIndex = new Map<number, SeedUser>();

    for (const user of existing as AnyRecord[]) {
      const index = this.parseUserIndex(String(user.email), prefix);
      if (index >= 0 && index < count && user.profile?.id) {
        byIndex.set(index, { id: user.id, profileId: user.profile.id, index });
      }
    }

    for (let index = 0; index < count; index += 1) {
      if (byIndex.has(index)) continue;
      const email = `${prefix}${String(index + 1).padStart(3, '0')}@runich.test`;
      const userId = this.uuid(`${runId}:user:${index}`);
      const profileId = this.uuid(`${runId}:profile:${index}`);
      const user = await this.prisma.user.create({
        data: {
          id: userId,
          email,
          encryptedPassword: MOCK_PASSWORD_HASH,
          emailConfirmedAt: new Date(),
          profile: {
            create: {
              id: profileId,
              email,
              name: `Load ${index + 1}`,
              surname: 'Runner',
              sport: 'RUNNING',
              city: 'Moscow',
              bio: `load-test:${runId}`,
              profilePhoto: null,
              emailNotifications: false,
            },
          },
        },
        include: { profile: { select: { id: true } } },
      });
      if (!user.profile) throw new Error(`Не удалось создать профиль load-test пользователя ${email}`);
      byIndex.set(index, { id: user.id, profileId: user.profile.id, index });
    }

    return Array.from({ length: count }, (_, index) => {
      const user = byIndex.get(index);
      if (!user) throw new Error(`Не найден load-test пользователь ${index + 1}`);
      return user;
    });
  }

  private async createFollowGraph(job: LoadTestSeedJob, users: SeedUser[], targetProfileId: string) {
    const now = new Date();
    const rows = users.flatMap((user) => [
      {
        id: this.uuid(`${job.runId}:target-follows:${user.index}`),
        userId: job.targetUserId,
        friendId: user.id,
        profileId: user.profileId,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.uuid(`${job.runId}:target-followers:${user.index}`),
        userId: user.id,
        friendId: job.targetUserId,
        profileId: targetProfileId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await this.prisma.friend.createMany({ data: rows, skipDuplicates: true });
  }

  private buildRelationRows(
    runId: string,
    activities: Array<{ id: string; ownerIndex: number; date: Date }>,
    users: SeedUser[],
    config: LoadTestSeedConfig,
  ) {
    const likes: AnyRecord[] = [];
    const comments: AnyRecord[] = [];
    const commentLikes: AnyRecord[] = [];

    for (const activity of activities) {
      for (let index = 0; index < config.activityLikesPerActivity; index += 1) {
        const author = users[(activity.ownerIndex + index + 1) % users.length];
        likes.push({
          id: this.uuid(`${runId}:activity-like:${activity.id}:${index}`),
          date: new Date(activity.date.getTime() + (index + 1) * MINUTE_IN_MS),
          authorId: author.id,
          activityId: activity.id,
          profileId: author.profileId,
        });
      }

      for (let index = 0; index < config.commentsPerActivity; index += 1) {
        const author = users[(activity.ownerIndex + index + 1) % users.length];
        const commentId = this.uuid(`${runId}:comment:${activity.id}:${index}`);
        const commentDate = new Date(activity.date.getTime() + (index + 1) * 15 * MINUTE_IN_MS);
        comments.push({
          id: commentId,
          date: commentDate,
          authorId: author.id,
          activityId: activity.id,
          profileId: author.profileId,
          comment: COMMENT_TEXTS[index % COMMENT_TEXTS.length],
        });

        for (let likeIndex = 0; likeIndex < config.commentLikesPerComment; likeIndex += 1) {
          const liker = users[(activity.ownerIndex + index + likeIndex + 11) % users.length];
          commentLikes.push({
            id: this.uuid(`${runId}:comment-like:${commentId}:${likeIndex}`),
            date: new Date(commentDate.getTime() + (likeIndex + 1) * MINUTE_IN_MS),
            authorId: liker.id,
            commentId,
            profileId: liker.profileId,
          });
        }
      }
    }

    return { likes, comments, commentLikes };
  }

  private async readManifest(key: string) {
    return (await this.storage.readJson<unknown>(key)) as LoadTestAssetManifest;
  }

  private validateManifest(
    manifest: LoadTestAssetManifest,
    config: LoadTestSeedConfig,
  ): asserts manifest is LoadTestAssetManifest {
    if (manifest?.version !== 1 || !Array.isArray(manifest.photos) || !Array.isArray(manifest.activities)) {
      throw new Error('Некорректный load-test manifest');
    }
    if (manifest.photos.length < config.photosPerActivity) {
      throw new Error(`В manifest недостаточно фото: нужно минимум ${config.photosPerActivity}`);
    }
    if (manifest.activities.length < config.activitiesPerFollower) {
      throw new Error(`В manifest недостаточно активностей: нужно минимум ${config.activitiesPerFollower}`);
    }
    manifest.photos.forEach((photo) => {
      if (!photo || typeof photo.url !== 'string' || !photo.url) throw new Error('Некорректное фото в manifest');
    });
    manifest.activities.forEach((activity) => {
      if (!activity || typeof activity.sourceActivityId !== 'string' || !activity.sourceActivityId) {
        throw new Error('Некорректная активность в manifest');
      }
    });
  }

  private normalizeConfig(input: LoadTestSeedRequest): LoadTestSeedConfig {
    const config: LoadTestSeedConfig = {
      followerCount: input.followerCount ?? LOAD_TEST_DEFAULT_CONFIG.followerCount,
      activitiesPerFollower: input.activitiesPerFollower ?? LOAD_TEST_DEFAULT_CONFIG.activitiesPerFollower,
      activityLikesPerActivity: input.activityLikesPerActivity ?? LOAD_TEST_DEFAULT_CONFIG.activityLikesPerActivity,
      commentsPerActivity: input.commentsPerActivity ?? LOAD_TEST_DEFAULT_CONFIG.commentsPerActivity,
      commentLikesPerComment: input.commentLikesPerComment ?? LOAD_TEST_DEFAULT_CONFIG.commentLikesPerComment,
      photosPerActivity: input.photosPerActivity ?? LOAD_TEST_DEFAULT_CONFIG.photosPerActivity,
    };
    if (
      config.activityLikesPerActivity > config.followerCount ||
      config.commentsPerActivity > config.followerCount ||
      config.commentLikesPerComment > config.followerCount
    ) {
      throw new Error('Количество авторов связей не может превышать followerCount');
    }
    return config;
  }

  private normalizeStoredConfig(value: unknown) {
    return this.normalizeConfig((value ?? {}) as LoadTestSeedRequest);
  }

  private async requeueInterruptedJobs() {
    await this.prisma.loadTestSeedJob.updateMany({
      where: { status: LOAD_TEST_SEED_STATUS.processing },
      data: { status: LOAD_TEST_SEED_STATUS.queued, startedAt: null },
    });
  }

  private async releaseForResume(id: string) {
    await this.prisma.loadTestSeedJob.updateMany({
      where: { id, status: LOAD_TEST_SEED_STATUS.processing },
      data: { status: LOAD_TEST_SEED_STATUS.queued, startedAt: null },
    });
  }

  private parseUserIndex(email: string, prefix: string) {
    const match = email.match(new RegExp(`^${this.escapeRegExp(prefix)}(\\d+)@`));
    return match ? Number(match[1]) - 1 : -1;
  }

  private uuid(seed: string) {
    const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private safeNumber(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
