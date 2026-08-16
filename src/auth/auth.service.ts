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
import { handleServiceError } from 'src/common/utils/prisma-errors';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from 'src/email/email.service';
import { getRandomInt } from 'src/common/utils/utils';
import type { Response } from 'express';
import { AuthTokenService } from './auth-token.service';
import type { SessionMetadata } from './auth-token.service';
import { YandexAuthService } from './yandex-auth.service';
import { AuthEmailService } from './auth-email.service';
import { VkAuthService } from './vk-auth.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly tokenService: AuthTokenService;
  private readonly yandexAuthService: YandexAuthService;
  private readonly authEmailService: AuthEmailService;
  private readonly vkAuthService: VkAuthService;

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
  ) {
    this.tokenService = tokenService ?? new AuthTokenService(this.jwtService);
    this.yandexAuthService = yandexAuthService ?? new YandexAuthService(this.prisma, this.tokenService);
    this.authEmailService = authEmailService ?? new AuthEmailService(this.emailService);
    this.vkAuthService = vkAuthService ?? new VkAuthService(this.prisma, this.jwtService, this.tokenService);
  }

  startVkAuth(response: Response) {
    return this.vkAuthService.start(response);
  }

  handleVkCallback(code: string, state: string, error: string, response: Response, deviceId?: string) {
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
      const user = await this.prisma.users.findUnique({ where: { email } });

      if (user && !user?.email_confirmed_at) {
        const accessToken = this.tokenService.createEmailAccessToken(user.id);
        const confirmationCode = getRandomInt(1, 100000);
        await this.sendConfirmationEmail(email, confirmationCode, accessToken);
        await this.prisma.users.update({
          where: { email },
          data: { confirmation_sent_at: new Date(), confirmation_token: `${confirmationCode}` },
        });
        return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
      } else {
        const hashedPassword = await bcrypt.hash(password, 10);
        const confirmationCode = getRandomInt(1, 100000);

        const user = await this.prisma.users.create({
          data: {
            email,
            encrypted_password: hashedPassword,
            confirmation_token: `${confirmationCode}`,
            confirmation_sent_at: new Date(),
            created_at: new Date(),
            profile: { create: {} },
          },
        });
        const accessToken = this.tokenService.createEmailAccessToken(user.id);
        await this.sendConfirmationEmail(email, confirmationCode, accessToken);
        return { message: 'Код подтверждения был выслан на Вашу электронную почту' };
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  private async sendConfirmationCode(email: string, confirmationCode: number, accessToken: string) {
    return this.authEmailService.sendConfirmationCode(email, confirmationCode, accessToken);
  }

  private async sendConfirmationEmail(email: string, confirmationCode: number, accessToken: string) {
    try {
      return await this.sendConfirmationCode(email, confirmationCode, accessToken);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Не удалось отправить письмо подтверждения на ${email}`, error);
      throw new ServiceUnavailableException('Сервис отправки электронной почты временно недоступен');
    }
  }

  async login(email: string, password: string, metadata: SessionMetadata = {}) {
    try {
      const user = await this.prisma.users.findUnique({ where: { email } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      } else {
        if (user.auth_provider === 'YANDEX' || user.auth_provider === 'VK') {
          const providerName = user.auth_provider === 'VK' ? 'VK' : 'Яндекс';
          throw new UnauthorizedException(
            `Вы зарегистрированы без пароля с помощью ${providerName}. Авторизуйтесь через ${providerName}`,
          );
        }
        const isPasswordValid = await bcrypt.compare(password, `${user.encrypted_password}`);
        if (!isPasswordValid) {
          throw new UnauthorizedException('Неправильный пароль');
        }
        if (!user.email_confirmed_at) {
          this.logger.warn(`Вход отклонён: учётная запись не подтверждена (${email})`);
          throw new UnauthorizedException('Данная учетная запись не подтверждена');
        }
        await this.prisma.users.update({ where: { id: user.id }, data: { last_sign_in_at: new Date() } });
        return this.tokenService.createSessionTokens(user.id, metadata);
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  async sendLoginLinkByEmail(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const accessToken = this.tokenService.createEmailAccessToken(user.id);
      await this.authEmailService.sendLoginLink(normalizedEmail, accessToken);

      return { message: 'Ссылка для входа в Runich отправлена на указанную почту' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async verifyToken(accessToken: string) {
    try {
      const tokenInfo = this.tokenService.verifyAccessToken(accessToken);
      if (!tokenInfo?.userId) {
        throw new UnauthorizedException('Информация о пользователе не была найдена');
      }
      const user = await this.prisma.users.findUnique({ where: { id: tokenInfo?.userId } });
      if (!user) {
        throw new NotFoundException('Пользователь не был найден');
      }
      if (!user?.email_confirmed_at) {
        await this.prisma.users.update({ where: { id: user.id }, data: { email_confirmed_at: new Date() } });
      }

      return this.tokenService.createSessionTokens(user.id);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Срок действия токена истёк');
      }
      handleServiceError(error);
    }
  }

  async refreshAccessToken(refreshToken: string, metadata: SessionMetadata = {}) {
    return this.tokenService.refreshAccessToken(refreshToken, metadata);
  }

  async deleteUser(userId: string) {
    try {
      const deletedUser = await this.prisma.$transaction(
        async (transaction) => {
          await transaction.friend.deleteMany({
            where: {
              OR: [{ user_id: userId }, { friendId: userId }],
            },
          });
          return transaction.users.delete({ where: { id: userId } });
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
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (confirmationCode !== user?.confirmation_token) {
        throw new BadRequestException('Код подтверждения не соответствует высланному');
      } else {
        await this.prisma.users.update({ where: { email: normalizedEmail }, data: { email_confirmed_at: new Date() } });
        return this.tokenService.createSessionTokens(user.id);
      }
    } catch (error) {
      handleServiceError(error);
    }
  }

  async getEmailCodeForPassword(email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }

      const recoveryCode = getRandomInt(100000, 999999);
      await this.authEmailService.sendPasswordChangeCode(normalizedEmail, recoveryCode);
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          recovery_token: `${recoveryCode}`,
          recovery_sent_at: new Date(),
        },
      });

      return { message: 'Код для смены email был выслан на указанную почту' };
    } catch (error) {
      handleServiceError(error);
    }
  }

  async verifyPasswordChangeCode(confirmationCode: string, email: string) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (confirmationCode !== user.recovery_token) {
        throw new BadRequestException('Код для смены пароля не соответствует высланному');
      }

      await this.prisma.users.update({
        where: { id: user.id },
        data: { recovery_token: null },
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
      const user = await this.prisma.users.findUnique({ where: { email: normalizedEmail } });
      if (!user) {
        throw new NotFoundException(`Такой email адрес не зарегистрирован ни на одного пользователя: ${email}`);
      }
      if (user.recovery_token !== null || !user.recovery_sent_at) {
        throw new BadRequestException('Сначала подтвердите код для смены пароля');
      }

      const encryptedPassword = await bcrypt.hash(password1, 10);
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          encrypted_password: encryptedPassword,
          recovery_token: null,
          recovery_sent_at: null,
        },
      });

      return this.tokenService.createSessionTokens(user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }
}
