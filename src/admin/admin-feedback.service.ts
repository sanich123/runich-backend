import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';
import type { AdminFeedbackStatus } from './admin-feedback.dto';
import type { AdminFeedbackDetailRow, AdminFeedbackRequestRow } from './admin-feedback.types';
import { formatFeedbackDate, parseFeedbackAttachments } from './admin-feedback.utils';

@Injectable()
export class AdminFeedbackService {
  private readonly logger = new Logger(AdminFeedbackService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  async list(status: AdminFeedbackStatus | undefined, take: number) {
    const requests: AdminFeedbackRequestRow[] = await this.prisma.feedbackRequest.findMany({
      ...(status ? { where: { status } } : {}),
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        kind: true,
        topic: true,
        email: true,
        text: true,
        deviceInfo: true,
        attachments: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return requests.map((request) => ({
      ...request,
      attachments: parseFeedbackAttachments(request.attachments),
      createdAt: formatFeedbackDate(request.createdAt),
      updatedAt: formatFeedbackDate(request.updatedAt),
    }));
  }

  async getById(id: string) {
    const request: AdminFeedbackDetailRow | null = await this.prisma.feedbackRequest.findUnique({
      where: { id },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    if (!request) throw new NotFoundException('Обращение не найдено');
    return {
      id: request.id,
      kind: request.kind,
      topic: request.topic,
      email: request.email,
      text: request.text,
      deviceInfo: request.deviceInfo,
      attachments: parseFeedbackAttachments(request.attachments),
      status: request.status,
      createdAt: formatFeedbackDate(request.createdAt),
      updatedAt: formatFeedbackDate(request.updatedAt),
      replies: request.replies.map((reply) => ({
        id: reply.id,
        text: reply.text,
        adminEmail: reply.adminEmail,
        deliveryStatus: reply.deliveryStatus,
        createdAt: formatFeedbackDate(reply.createdAt),
      })),
    };
  }

  async updateStatus(id: string, status: AdminFeedbackStatus) {
    try {
      await this.prisma.feedbackRequest.update({ where: { id }, data: { status } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundException('Обращение не найдено');
      }
      throw error;
    }
    return await this.getById(id);
  }

  async reply(id: string, adminUserId: string, rawText: string) {
    const request = await this.prisma.feedbackRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Обращение не найдено');
    const admin = await this.prisma.user.findUnique({ where: { id: adminUserId }, select: { email: true } });
    if (!admin) throw new NotFoundException('Администратор не найден');

    const text = rawText.trim();
    if (!text) throw new BadRequestException('Текст ответа не может быть пустым');
    const reply = await this.prisma.feedbackReply.create({
      data: {
        requestId: id,
        adminUserId,
        adminEmail: admin.email,
        text,
        deliveryStatus: 'pending',
      },
    });
    try {
      await this.emailService.sendFeedbackReply(request.email, text, request.createdAt);
    } catch (error) {
      await this.prisma.feedbackReply.update({ where: { id: reply.id }, data: { deliveryStatus: 'failed' } });
      this.logger.error(
        `Не удалось отправить ответ по обращению ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException('Ответ сохранён, но письмо отправить не удалось');
    }

    await this.prisma.feedbackReply.update({ where: { id: reply.id }, data: { deliveryStatus: 'sent' } });
    if (request.status === 'open') {
      await this.prisma.feedbackRequest.update({ where: { id }, data: { status: 'in_progress' } });
    }
    return await this.getById(id);
  }
}
