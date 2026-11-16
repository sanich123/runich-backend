import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { StorageService } from 'src/storage/services/storage.service';
import { EmailService } from 'src/email/email.service';
import { FeedbackDto } from './feedback.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  async create(feedback: FeedbackDto, userId?: string) {
    const text = feedback.text.trim();
    const deviceInfo = feedback.deviceInfo.trim();
    if (!text) throw new BadRequestException('Текст обращения не может быть пустым');
    if (!deviceInfo) throw new BadRequestException('Укажите устройство и версию приложения');

    let email = feedback.email?.trim().toLowerCase();
    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) throw new NotFoundException('Пользователь для обращения не найден');
      email = user.email.trim().toLowerCase();
    } else if (!email) {
      throw new BadRequestException('Для обращения укажите email');
    }
    if (!email) throw new BadRequestException('Для обращения укажите email');

    const attachments = feedback.attachments ?? [];
    this.validateAttachments(userId ?? null, feedback);
    const existing = await this.prisma.feedbackRequest.findUnique({ where: { id: feedback.feedbackId } });
    if (existing) {
      if (existing.email !== email || existing.senderUserId !== (userId ?? null)) {
        throw new ConflictException('Обращение с таким идентификатором уже существует');
      }
      return { id: existing.id, email: existing.email, confirmationEmailSent: existing.confirmationEmailSent };
    }

    const request = await this.prisma.feedbackRequest.create({
      data: {
        id: feedback.feedbackId,
        kind: feedback.kind,
        topic: feedback.topic,
        email,
        text,
        deviceInfo,
        attachments: attachments.length ? attachments : undefined,
        senderUserId: userId,
      },
    });

    let adminNotificationSent = false;
    try {
      await this.emailService.sendNewFeedbackNotification({
        id: request.id,
        createdAt: request.createdAt,
        kind: request.kind,
        topic: request.topic,
        email: request.email,
        text: request.text,
        deviceInfo: request.deviceInfo,
        attachments,
      });
      adminNotificationSent = true;
    } catch (error) {
      this.logger.error(
        `Не удалось отправить уведомление об обращении ${request.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    let confirmationEmailSent = false;
    try {
      await this.emailService.sendFeedbackReceipt(email, request.createdAt);
      confirmationEmailSent = true;
    } catch (error) {
      this.logger.error(
        `Не удалось отправить подтверждение обращения ${request.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.prisma.feedbackRequest.update({
      where: { id: request.id },
      data: { adminNotificationSent, confirmationEmailSent },
    });
    return { id: request.id, email, confirmationEmailSent };
  }

  private validateAttachments(userId: string | null, feedback: FeedbackDto) {
    if (!feedback.attachments?.length) return;

    for (const { url, thumbnail } of feedback.attachments) {
      this.storageService.getFeedbackAttachmentKey(userId, feedback.feedbackId, url);
      if (thumbnail) this.storageService.getFeedbackAttachmentKey(userId, feedback.feedbackId, thumbnail);
    }
  }
}
