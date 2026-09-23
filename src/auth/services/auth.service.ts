import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { handleServiceError } from 'src/common/utils/database-errors';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from 'src/email/email.service';
import { getRandomInt } from 'src/common/utils/utils';
import type { Response } from 'express';
import { AuthTokenService } from './auth-token.service';
import type { SessionMetadata } from '../types/auth.types';
import { YandexAuthService } from './yandex-auth.service';
import { AuthEmailService } from './auth-email.service';
import { VkAuthService } from './vk-auth.service';
import { MediaCleanupService } from 'src/storage/media-cleanup.service';
import { normalizeEmail } from '../utils/russian-email';
import { CONFIRMATION_CODE_TTL_MS } from '../constants/auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly tokenService: AuthTokenService;
  private readonly yandexAuthService: YandexAuthService;
  private readonly authEmailService: AuthEmailService;
  private readonly vkAuthService: VkAuthService;
  private readonly mediaCleanupService?: MediaCleanupService;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private jwtService: JwtService,
    @Inject(EmailService)
    private emailService: EmailService,
    @Inject(AuthTokenService)
    tokenService?: AuthTokenService,
    @Inject(YandexAuthService)
    yandexAuthService?: YandexAuthService,
    @Inject(AuthEmailService)
    authEmailService?: AuthEmailService,
    @Inject(VkAuthService)
    vkAuthService?: VkAuthService,
    @Inject(MediaCleanupService)
    mediaCleanupService?: MediaCleanupService,
  ) {
    this.tokenService = tokenService ?? new AuthTokenService(this.jwtService);
    this.yandexAuthService = yandexAuthService ?? new YandexAuthService(this.prisma, this.tokenService);
    this.authEmailService = authEmailService ?? new AuthEmailService(this.emailService);
    this.vkAuthService = vkAuthService ?? new VkAuthService(this.prisma, this.jwtService, this.tokenService);
    this.mediaCleanupService = mediaCleanupService;
  }

  startVkAuth(response: Response) {
    return this.vkAuthService.start(response);
  }

  handleVkCallback(code: string, state: string, error: string | undefined, response: Response, deviceId?: string) {
    return this.vkAuthService.callback(code, state, error, response, deviceId);
  }

  startYandexAuth(response: Response) {
    return this.yandexAuthService.start(response);
  }

  async handleYandexCallback(code: string, error: string, response: Response) {
    return this.yandexAuthService.callback(code, error, response);
  }

  async signUp(email: string, password: string) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (user && !user?.emailConfirmedAt) {
        const loginCredential = await this.tokenService.createEmailLoginCredential(user.id);
        const confirmationCode = getRandomInt(1, 100000);
        await this.sendConfirmationEmail(normalizedEmail, confirmationCode, loginCredential);
        await this.prisma.user.update({
          where: { email: normalizedEmail },
          data: { confirmationSentAt: new Date(), confirmationToken: `${confirmationCode}` },
        });
        return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
      } else {
        const hashedPassword = await bcrypt.hash(password, 10);
        const confirmationCode = getRandomInt(1, 100000);

        const user = await this.prisma.user.create({
          data: {
            email: normalizedEmail,
            encryptedPassword: hashedPassword,
            confirmationToken: `${confirmationCode}`,
            confirmationSentAt: new Date(),
            createdAt: new Date(),
            profile: { create: {} },
          },
        });
        const loginCredential = await this.tokenService.createEmailLoginCredential(user.id);
        await this.sendConfirmationEmail(normalizedEmail, confirmationCode, loginCredential);
        return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async sendConfirmationCode(email: string, confirmationCode: number, loginCredential: string) {
    return this.authEmailService.sendConfirmationCode(email, confirmationCode, loginCredential);
  }

  private async sendConfirmationEmail(email: string, confirmationCode: number, loginCredential: string) {
    try {
      return await this.sendConfirmationCode(email, confirmationCode, loginCredential);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Не удалось отправить письмо подтверждения на ${email}`, error);
      throw new ServiceUnavailableException('Сервис отправки электронной почты временно недоступен');
    }
  }

  async login(email: string, password: string, metadata: SessionMetadata = {}) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(
          `Такой email адрес не зарегистрирован ни на одного пользователя: ${normalizedEmail}`,
        );
      } else {
        if (!user.encryptedPassword && (user.authProvider === 'YANDEX' || user.authProvider === 'VK')) {
          const providerName = user.authProvider === 'VK' ? 'VK' : 'Яндекс';
          throw new UnauthorizedException(
            `Вы зарегистрированы без пароля с помощью ${providerName}. Авторизуйтесь через ${providerName}`,
          );
        }
        const isPasswordValid = await bcrypt.compare(password, user.encryptedPassword ?? '');
        if (!isPasswordValid) {
          throw new UnauthorizedException('Неправильный пароль');
        }
        if (!user.emailConfirmedAt) {
          this.logger.warn(`Вход отклонён: учётная запись не подтверждена (${normalizedEmail})`);
          throw new UnauthorizedException('Данная учетная запись не подтверждена');
        }
        await this.prisma.user.update({ where: { id: user.id }, data: { lastSignInAt: new Date() } });
        return this.tokenService.createSessionTokens(user.id, metadata);
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  async sendLoginLinkByEmail(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const loginCredential = await this.tokenService.createEmailLoginCredential(user.id);
      await this.authEmailService.sendLoginLink(normalizedEmail, loginCredential);

      return { message: 'Ссылка для входа в Runich отправлена на указанную почту' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async verifyToken(code: string, metadata: SessionMetadata = {}) {
    try {
      const userId = await this.tokenService.consumeEmailLoginCode(code);
      await this.prisma.user.update({
        where: { id: userId },
        data: { emailConfirmedAt: new Date(), lastSignInAt: new Date() },
      });
      return this.tokenService.createSessionTokens(userId, metadata);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async refreshAccessToken(refreshToken: string, metadata: SessionMetadata = {}) {
    return this.tokenService.refreshAccessToken(refreshToken, metadata);
  }

  async logout(userId: string, sessionId?: string) {
    try {
      if (sessionId) await this.tokenService.revokeSession(userId, sessionId);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async deleteUser(userId: string) {
    try {
      const deletedUser = await this.prisma.$transaction(
        async (transaction) => {
          if (this.mediaCleanupService) {
            await this.mediaCleanupService.enqueueUserCleanup(userId, transaction as never);
          }
          await transaction.friend.deleteMany({
            where: {
              OR: [{ userId }, { friendId: userId }],
            },
          });
          return transaction.user.delete({ where: { id: userId } });
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
      return deletedUser;
    } catch (error) {
      handleServiceError(error);
    }
  }

  async confirmEmailByCode(confirmationCode: string, email: string) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (user.emailConfirmedAt) {
        throw new BadRequestException('Email уже подтверждён');
      }
      if (confirmationCode !== user.confirmationToken) {
        throw new BadRequestException('Код подтверждения не соответствует высланному');
      }

      const now = new Date();
      const confirmationSentAt = user.confirmationSentAt ? new Date(user.confirmationSentAt).getTime() : 0;
      if (!confirmationSentAt || now.getTime() - confirmationSentAt > CONFIRMATION_CODE_TTL_MS) {
        throw new BadRequestException('Срок действия кода подтверждения истёк');
      }

      const consumed = await this.prisma.user.updateMany({
        where: {
          email: normalizedEmail,
          confirmationToken: confirmationCode,
          emailConfirmedAt: null,
          confirmationSentAt: { gt: new Date(now.getTime() - CONFIRMATION_CODE_TTL_MS) },
        },
        data: { emailConfirmedAt: now, confirmationToken: null },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Код подтверждения недействителен или уже использован');
      }

      return this.tokenService.createSessionTokens(user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getEmailCodeForPassword(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const recoveryCode = getRandomInt(100000, 999999);
      await this.authEmailService.sendPasswordChangeCode(normalizedEmail, recoveryCode);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          recoveryToken: `${recoveryCode}`,
          recoverySentAt: new Date(),
        },
      });

      return { message: 'Код для смены пароля был выслан на указанную почту' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async verifyPasswordChangeCode(confirmationCode: string, email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (confirmationCode !== user.recoveryToken) {
        throw new BadRequestException('Код для смены пароля не соответствует высланному');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { recoveryToken: null },
      });

      return { message: 'Код для смены пароля подтверждён' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async changePassword(password1: string, password2: string, email: string) {
    try {
      if (password1 !== password2) {
        throw new BadRequestException('Пароли не совпадают');
      }
      if (password1.length < 8 || !/[A-Z]/.test(password1) || !/\d/.test(password1)) {
        throw new BadRequestException('Пароль должен содержать минимум 8 символов, одну заглавную букву и одну цифру');
      }

      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (user.recoveryToken !== null || !user.recoverySentAt) {
        throw new BadRequestException('Сначала подтвердите код для смены пароля');
      }

      const encryptedPassword = await bcrypt.hash(password1, 10);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          encryptedPassword,
          recoveryToken: null,
          recoverySentAt: null,
        },
      });

      return this.tokenService.createSessionTokens(user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }
}
